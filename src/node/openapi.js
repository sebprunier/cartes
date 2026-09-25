// OpenAPI description of the HTTP API, served by the API itself: software that integrates it reads there what
// it can ask for, and what it gets back. The paths and the fields are given by their French name; their
// English aliases are listed in the text.

import { MAP_LAYER_THEMES } from '../core/maplayers.js';
import {
  CUSTOM_LAYER_FIELDS,
  DATA_FIELDS,
  LAYER_FIELDS,
  REQUEST_FIELDS,
  acceptedNames,
  englishAliases,
} from './api-fields.js';

const error = { $ref: '#/components/responses/Erreur' };
const unauthorized = { $ref: '#/components/responses/NonAutorise' };
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

/** An object whose fields are accepted under their French name and their English alias, and none other. */
function fieldsObject(fields, schema) {
  const aliases = englishAliases(fields);
  return {
    type: 'object',
    ...schema,
    description:
      `${schema.description} Chaque champ accepte aussi son nom anglais : ${aliases.join(', ')}. ` +
      'Un champ inconnu est refusé.',
    propertyNames: { enum: acceptedNames(fields) },
  };
}

const MAP_REQUEST = fieldsObject(REQUEST_FIELDS, {
  description: 'Les options de `cartes generer`, en champs JSON.',
  required: ['commune'],
  properties: {
    commune: { type: 'string', description: 'Nom de la commune ou code INSEE.', examples: ['86081'] },
    departement: { type: 'string', description: 'Département, pour lever une homonymie.', examples: ['86'] },
    fond: { type: 'string', default: 'plan-ign', description: 'Fond de carte : voir /fonds.' },
    zoom: { type: 'integer', default: 17, minimum: 0, description: "Niveau de zoom, qui décide de la taille de l'image." },
    couches: {
      type: 'array',
      description: 'Couches superposées au fond de carte : voir /couches.',
      items: {
        oneOf: [
          { type: 'string', examples: ['cadastre'] },
          fieldsObject(LAYER_FIELDS, {
            description: 'Une couche du catalogue, avec son opacité.',
            required: ['id'],
            properties: { id: { type: 'string' }, opacite: { type: 'number', minimum: 0, maximum: 1 } },
          }),
        ],
      },
    },
    couchesPerso: {
      type: 'array',
      description: 'Couches ajoutées par l’adresse de leurs tuiles, ou par celle d’un service WMS et le nom de sa couche.',
      items: fieldsObject(CUSTOM_LAYER_FIELDS, {
        description: 'Une couche ajoutée par son adresse.',
        required: ['adresse', 'source'],
        properties: {
          adresse: { type: 'string', examples: ['https://exemple.fr/tuiles/{z}/{x}/{y}.pbf', 'https://exemple.fr/wms'] },
          couche: { type: 'string', description: 'Pour un service WMS : le nom de la couche, tel que le service l’annonce.' },
          nom: { type: 'string' },
          source: { type: 'string', description: 'Mention de la source, écrite sur la carte.' },
          opacite: { type: 'number', minimum: 0, maximum: 1, default: 0.6 },
        },
      }),
    },
    donnees: {
      type: 'array',
      description: 'Données de la commune à ajouter sur la carte, en GeoJSON ou en CSV.',
      items: fieldsObject(DATA_FIELDS, {
        description: 'Un fichier de données.',
        required: ['fichier', 'contenu'],
        properties: {
          fichier: { type: 'string', description: "Nom du fichier : son extension en dit le format.", examples: ['points.geojson'] },
          titre: { type: 'string', description: 'Nom du jeu de données, pour la légende et la mention des sources.' },
          contenu: { type: 'string', description: 'Contenu du fichier, en texte.' },
        },
      }),
    },
    donneesCategorie: { type: 'string', description: 'Propriété qui porte la catégorie des objets.' },
    donneesCouleur: { type: 'string', description: 'Propriété qui porte la couleur des objets.' },
    format: { type: 'string', enum: ['png', 'jpg', 'tif'], description: 'Par défaut, celui du fond de carte.' },
    marge: { type: 'number', default: 0.03, minimum: 0 },
    dpi: { type: 'integer', default: 150, minimum: 1 },
    gris: { type: 'boolean', default: false },
    contour: { type: 'boolean', default: true },
    legende: { type: 'boolean', default: true },
  },
});

const HOME = {
  type: 'object',
  properties: {
    nom: { type: 'string', enum: ['cartes'] },
    version: { type: 'string', examples: ['1.0.0'] },
    description: { type: 'string' },
    cleRequise: { type: 'boolean', description: "Si l'instance exige une clé d'API." },
    documentation: { type: 'string', format: 'uri' },
    openapi: { type: 'string', description: 'Chemin de cette description.' },
  },
};

const MUNICIPALITY = {
  type: 'object',
  required: ['codeInsee', 'nom'],
  properties: {
    codeInsee: { type: 'string', examples: ['86081'] },
    nom: { type: 'string', examples: ['Colombiers'] },
    codePostal: { type: 'string', examples: ['86490'] },
    departement: { type: 'string', examples: ['86'] },
    contexte: {
      type: 'string',
      description: 'Le département et la région.',
      examples: ['86, Vienne, Nouvelle-Aquitaine'],
    },
    population: { type: ['integer', 'null'] },
  },
};

const BASEMAP = {
  type: 'object',
  required: ['id', 'nom', 'zoomMax', 'format', 'source'],
  properties: {
    id: { type: 'string', examples: ['plan-ign'] },
    nom: { type: 'string' },
    zoomMax: { type: 'integer', description: 'Dernier niveau de zoom que le fond publie.' },
    format: { type: 'string', enum: ['png', 'jpg'], description: 'Format de fichier par défaut pour ce fond.' },
    source: { type: 'string', description: 'Mention de la source, écrite sur la carte.' },
  },
};

const MAP_LAYER = {
  type: 'object',
  required: ['id', 'nom', 'description', 'theme', 'fournisseur', 'opacite', 'source'],
  properties: {
    id: { type: 'string', examples: ['cadastre'] },
    nom: { type: 'string' },
    description: { type: 'string' },
    theme: {
      type: 'string',
      enum: MAP_LAYER_THEMES.map((theme) => theme.id),
      description: MAP_LAYER_THEMES.map((theme) => `${theme.id} : ${theme.name}`).join(' ; ') + '.',
    },
    fournisseur: { type: 'string', description: 'Qui publie la couche.', examples: ['IGN'] },
    zoomMin: {
      type: 'integer',
      description: 'Niveau de zoom à partir duquel la couche se dessine, quand elle en a un.',
    },
    opacite: { type: 'number', minimum: 0, maximum: 1, description: 'Opacité par défaut.' },
    source: { type: 'string', description: 'Mention de la source, écrite sur la carte.' },
  },
};

const ESTIMATE = {
  type: 'object',
  properties: {
    commune: { type: 'object', properties: { codeInsee: { type: 'string' }, nom: { type: 'string' } } },
    zoom: { type: 'integer' },
    dpi: { type: 'integer' },
    format: { type: 'string', enum: ['png', 'jpg', 'tif'] },
    poids: {
      type: ['integer', 'null'],
      description: 'Poids estimé du fichier au zoom demandé, en octets ; null si l’échantillon n’a pu être téléchargé.',
    },
    poidsLisible: { type: ['string', 'null'], examples: ['≈ 2,7 Mo'] },
    niveaux: {
      type: 'array',
      description: 'Du zoom demandé, ou six niveaux sous le dernier, jusqu’au dernier niveau du fond.',
      items: {
        type: 'object',
        properties: {
          zoom: { type: 'integer' },
          metresParPixel: { type: 'number' },
          largeur: { type: 'integer', description: "Largeur de l'image, en pixels." },
          hauteur: { type: 'integer' },
          tuiles: { type: 'integer' },
          impression: {
            type: 'object',
            properties: {
              largeurMm: { type: 'integer' },
              hauteurMm: { type: 'integer' },
              format: { type: 'string', description: 'Format papier le plus proche.', examples: ['A1'] },
            },
          },
          memoire: { type: 'integer', description: "Mémoire de l'image non compressée, en octets." },
          memoireLisible: { type: 'string', examples: ['239 Mo'] },
        },
      },
    },
    avertissements: { type: 'array', items: { type: 'string' } },
  },
};

const MAP = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    statut: { type: 'string', enum: ['en attente', 'en cours', 'terminée', 'échouée', 'annulée', 'supprimée'] },
    fichier: { type: ['string', 'null'], description: 'Adresse du fichier, une fois la carte terminée.' },
    nomFichier: { type: 'string', examples: ['86081-colombiers-plan-ign-cadastre-z17.png'] },
    poids: { type: ['integer', 'null'], description: 'Poids du fichier, en octets.' },
    largeur: { type: 'integer' },
    hauteur: { type: 'integer' },
    avancement: {
      type: 'object',
      description:
        'Pour chaque source (fond de carte, couche), le nombre de tuiles ou d’images faites sur le total ; pour ' +
        '« dates », les dates des données lues dans le catalogue, et celles qu’il n’a pas données (manquantes).',
      additionalProperties: {
        type: 'object',
        properties: { fait: { type: 'integer' }, total: { type: 'integer' }, manquantes: { type: 'integer' } },
      },
    },
    etapes: { type: 'array', items: { type: 'string' } },
    avertissements: { type: 'array', items: { type: 'string' } },
    erreur: { type: ['string', 'null'] },
    creation: { type: 'string', format: 'date-time' },
    debut: { type: ['string', 'null'], format: 'date-time' },
    fin: { type: ['string', 'null'], format: 'date-time' },
    expiration: { type: ['string', 'null'], format: 'date-time' },
  },
};

const json = (schema, description) => ({ description, content: { 'application/json': { schema } } });

export function openApi(version) {
  return {
    openapi: '3.1.2',
    info: {
      title: 'cartes',
      version,
      license: { name: 'MIT', identifier: 'MIT' },
      description:
        'Cartes détaillées des communes françaises, prêtes à imprimer en grand format. ' +
        'Chaque chemin a un alias anglais : /municipalities, /basemaps, /maplayers, /estimates, /maps, ' +
        '/maps/{id}/file. Une erreur est renvoyée en JSON, décrite en français, sous « erreur ».',
    },
    security: [{ cle: [] }],
    paths: {
      '/': {
        get: {
          summary: "Décrire l'instance",
          description: "Sa version, et si elle exige une clé d'API. Ce chemin ne demande pas la clé.",
          security: [],
          responses: { 200: json(HOME, 'Instance.') },
        },
      },
      '/openapi.json': {
        get: {
          summary: "Décrire l'API",
          description: 'Cette description. Ce chemin ne demande pas la clé.',
          security: [],
          responses: { 200: { description: 'Description OpenAPI 3.1.', content: { 'application/json': {} } } },
        },
      },
      '/communes': {
        get: {
          summary: 'Chercher une commune par son nom',
          description: 'Les paramètres acceptent aussi leur nom anglais : name, department.',
          parameters: [
            { name: 'nom', in: 'query', required: true, schema: { type: 'string' }, example: 'Colombiers' },
            { name: 'departement', in: 'query', schema: { type: 'string' }, example: '86' },
          ],
          responses: {
            200: json({ type: 'array', items: MUNICIPALITY }, 'Communes trouvées, peut-être aucune.'),
            400: error,
            401: unauthorized,
          },
        },
      },
      '/fonds': {
        get: {
          summary: 'Lister les fonds de carte',
          responses: { 200: json({ type: 'array', items: BASEMAP }, 'Fonds de carte.'), 401: unauthorized },
        },
      },
      '/couches': {
        get: {
          summary: 'Lister les couches superposables',
          responses: {
            200: json({ type: 'array', items: MAP_LAYER }, 'Couches, dans l’ordre du catalogue.'),
            401: unauthorized,
          },
        },
      },
      '/estimations': {
        post: {
          summary: 'Estimer une carte avant de la générer',
          description:
            "Pour chaque niveau de zoom, la taille de l'image, de l'impression et de la mémoire ; " +
            'pour le zoom demandé, le poids estimé du fichier, à partir d’un échantillon de tuiles.',
          requestBody: { required: true, content: { 'application/json': { schema: MAP_REQUEST } } },
          responses: { 200: json(ESTIMATE, 'Estimation.'), 400: error, 401: unauthorized, 413: error },
        },
      },
      '/cartes': {
        post: {
          summary: 'Demander une carte',
          description:
            'La carte est générée en arrière-plan : suivez-la sur /cartes/{id}, puis téléchargez-la sur ' +
            '/cartes/{id}/fichier. Elle est conservée une durée limitée, indiquée par son expiration.',
          requestBody: { required: true, content: { 'application/json': { schema: MAP_REQUEST } } },
          responses: {
            202: {
              ...json(MAP, 'Carte acceptée.'),
              headers: { Location: { description: 'Le chemin où suivre la carte.', schema: { type: 'string' } } },
            },
            400: error,
            401: unauthorized,
            413: error,
          },
        },
      },
      '/cartes/{id}': {
        get: {
          summary: 'Suivre une carte',
          parameters: [id],
          responses: { 200: json(MAP, 'Carte.'), 401: unauthorized, 404: error },
        },
        delete: {
          summary: 'Annuler une carte, ou supprimer une carte terminée',
          description: 'Une carte supprimée n’existe plus : la suivre ensuite répond 404.',
          parameters: [id],
          responses: { 200: json(MAP, 'Carte, annulée ou supprimée.'), 401: unauthorized, 404: error },
        },
      },
      '/cartes/{id}/fichier': {
        get: {
          summary: 'Télécharger une carte terminée',
          parameters: [id],
          responses: {
            200: {
              description: 'Image de la carte, sous son nom de fichier (Content-Disposition).',
              content: { 'image/png': {}, 'image/jpeg': {}, 'image/tiff': {} },
            },
            401: unauthorized,
            404: error,
            409: {
              ...error,
              description: "La carte n'est pas prête : elle est en attente, en cours, échouée ou annulée.",
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cle: {
          type: 'http',
          scheme: 'bearer',
          description: "Seulement si l'instance a une clé d'API (variable CARTES_CLE_API).",
        },
      },
      responses: {
        Erreur: json({ type: 'object', properties: { erreur: { type: 'string' } } }, 'Erreur, décrite en français.'),
        NonAutorise: json(
          { type: 'object', properties: { erreur: { type: 'string' } } },
          "Clé d'API absente ou invalide, quand l'instance en exige une.",
        ),
      },
    },
  };
}
