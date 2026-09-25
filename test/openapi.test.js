import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Validator } from '@seriousme/openapi-schema-validator';

import { CUSTOM_LAYER_FIELDS, DATA_FIELDS, LAYER_FIELDS, REQUEST_FIELDS } from '../src/node/api-fields.js';
import { openApi } from '../src/node/openapi.js';
import { createApiServer } from '../src/node/server.js';

const JSON_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

/** Every Schema Object of the description, with where it stands, for the messages. */
function* schemas(document) {
  function* walk(schema, where) {
    if (!schema || typeof schema !== 'object') return;
    yield [schema, where];
    for (const [name, property] of Object.entries(schema.properties ?? {})) yield* walk(property, `${where}.${name}`);
    if (schema.items) yield* walk(schema.items, `${where}[]`);
    if (typeof schema.additionalProperties === 'object') yield* walk(schema.additionalProperties, `${where}{}`);
    for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
      for (const [index, branch] of (schema[keyword] ?? []).entries()) yield* walk(branch, `${where}.${keyword}[${index}]`);
    }
  }
  for (const [route, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const where = `${method.toUpperCase()} ${route}`;
      for (const parameter of operation.parameters ?? []) yield* walk(parameter.schema, `${where} ${parameter.name}`);
      for (const [type, { schema }] of Object.entries(operation.requestBody?.content ?? {})) {
        yield* walk(schema, `${where} ${type}`);
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        for (const [type, { schema }] of Object.entries(response.content ?? {})) {
          yield* walk(schema, `${where} ${status} ${type}`);
        }
      }
    }
  }
  for (const [name, response] of Object.entries(document.components.responses)) {
    for (const { schema } of Object.values(response.content ?? {})) yield* walk(schema, `components ${name}`);
  }
}

describe('OpenAPI description', () => {
  const document = openApi('9.9.9');

  it('is written in OpenAPI 3.1.2', () => {
    assert.equal(document.openapi, '3.1.2');
    assert.equal(document.info.version, '9.9.9');
  });

  it('is valid against the official schema of OpenAPI 3.1', async () => {
    const result = await new Validator().validate(document);
    assert.ok(result.valid, JSON.stringify(result.errors, null, 2));
  });

  // The official schema checks the structure of the document, not what its schemas hold: a type 'entier'
  // passes it. OpenAPI 3.1 schemas are JSON Schema 2020-12, and the keywords of 3.0 that it dropped would
  // be read by nothing.
  it('writes its schemas in JSON Schema, without the keywords of OpenAPI 3.0', () => {
    let count = 0;
    for (const [schema, where] of schemas(document)) {
      count++;
      assert.ok(!('nullable' in schema), `${where} : nullable, remplacé par un type 'null'`);
      assert.ok(!('example' in schema), `${where} : example, remplacé par examples`);
      if ('examples' in schema) assert.ok(Array.isArray(schema.examples), `${where} : examples est une liste`);
      for (const type of [schema.type ?? []].flat()) assert.ok(JSON_SCHEMA_TYPES.has(type), `${where} : type ${type}`);
    }
    assert.ok(count > 30, `${count} schémas seulement : le parcours en oublie`);
  });

  it('describes the fields of a request that the server reads, under both their names', () => {
    const request = document.paths['/cartes'].post.requestBody.content['application/json'].schema;
    const { properties } = request;
    for (const [schema, fields, where] of [
      [request, REQUEST_FIELDS, 'la demande'],
      [properties.couches.items.oneOf[1], LAYER_FIELDS, 'une couche'],
      [properties.couchesPerso.items, CUSTOM_LAYER_FIELDS, 'une couche ajoutée'],
      [properties.donnees.items, DATA_FIELDS, 'un fichier de données'],
    ]) {
      assert.deepEqual(Object.keys(schema.properties).sort(), Object.keys(fields).sort(), where);
      for (const [french, english] of Object.entries(fields)) {
        assert.ok(schema.propertyNames.enum.includes(french), `${where} : ${french}`);
        assert.ok(schema.propertyNames.enum.includes(english), `${where} : ${english}`);
        if (french !== english) assert.ok(schema.description.includes(english), `${english} absent de la description`);
      }
    }
  });

  it('gives every service its answer, and every protected service what a missing key answers', () => {
    for (const [route, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const where = `${method.toUpperCase()} ${route}`;
        const ok = operation.responses[200] ?? operation.responses[202];
        assert.ok(ok?.content, `${where} : pas de réponse décrite`);
        const isPublic = Array.isArray(operation.security) && operation.security.length === 0;
        assert.equal(Boolean(operation.responses[401]), !isPublic, `${where} : 401`);
      }
    }
  });

  // A service described and not served, or renamed on one side only, is found here rather than by a client.
  it('describes only services the server has', async (t) => {
    const server = createApiServer({ cacheDir: tmpdir(), outputDir: path.join(tmpdir(), 'cartes-openapi-test') });
    await new Promise((resolve) => server.listen(0, 'localhost', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));

    for (const [route, operations] of Object.entries(document.paths)) {
      for (const method of Object.keys(operations)) {
        const url = `http://localhost:${server.address().port}${route.replace('{id}', 'inconnue')}`;
        // Without a body or a municipality, each service refuses the request, which is enough to know it is there.
        const response = await fetch(url, { method: method.toUpperCase(), body: method === 'post' ? '{}' : undefined });
        const body = await response.json();
        assert.doesNotMatch(body.erreur ?? '', /^Aucun service à cette adresse/, `${method.toUpperCase()} ${route}`);
      }
    }
  });
});
