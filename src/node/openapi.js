// OpenAPI description of the HTTP API, served by the API itself: software that integrates it reads there what
// it can ask for. The paths are given by their French name; their English aliases are listed in the text.

const error = { $ref: '#/components/responses/Erreur' };
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const MAP_REQUEST = {
  type: 'object',
  description:
    'Les options de `cartes generer`, en champs JSON. Chaque champ accepte aussi son nom anglais : municipality, ' +
    'department, basemap, zoom, maplayers, customLayers, data, dataCategory, dataColor, format, margin, dpi, ' +
    'grayscale, outline, legend. Un champ inconnu est refusé.',
  required: ['commune'],
  additionalProperties: false,
  properties: {
    commune: { type: 'string', description: 'Nom de la commune ou code INSEE.', example: '86081' },
    departement: { type: 'string', description: 'Département, pour lever une homonymie.', example: '86' },
    fond: { type: 'string', default: 'plan-ign', description: 'Fond de carte : voir /fonds.' },
    zoom: { type: 'integer', default: 17, minimum: 0, description: "Niveau de zoom, qui décide de la taille de l'image." },
    couches: {
      type: 'array',
      description: 'Couches superposées au fond de carte : voir /couches.',
      items: {
        oneOf: [
          { type: 'string', example: 'cadastre' },
          {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' }, opacite: { type: 'number', minimum: 0, maximum: 1 } },
          },
        ],
      },
    },
    couchesPerso: {
      type: 'array',
      description: 'Couches ajoutées par l’adresse de leurs tuiles.',
      items: {
        type: 'object',
        required: ['adresse', 'source'],
        properties: {
          adresse: { type: 'string', example: 'https://exemple.fr/tuiles/{z}/{x}/{y}.pbf' },
          nom: { type: 'string' },
          source: { type: 'string', description: 'Mention de la source, écrite sur la carte.' },
          opacite: { type: 'number', minimum: 0, maximum: 1, default: 0.6 },
        },
      },
    },
    donnees: {
      type: 'array',
      description: 'Données de la commune à ajouter sur la carte, en GeoJSON ou en CSV.',
      items: {
        type: 'object',
        required: ['fichier', 'contenu'],
        properties: {
          fichier: { type: 'string', description: "Nom du fichier : son extension en dit le format.", example: 'points.geojson' },
          titre: { type: 'string', description: 'Nom du jeu de données, pour la légende et la mention des sources.' },
          contenu: { type: 'string', description: 'Contenu du fichier, en texte.' },
        },
      },
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
};

const MAP = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    statut: { type: 'string', enum: ['en attente', 'en cours', 'terminée', 'échouée', 'annulée', 'supprimée'] },
    fichier: { type: 'string', nullable: true, description: 'Adresse du fichier, une fois la carte terminée.' },
    nomFichier: { type: 'string' },
    poids: { type: 'integer', nullable: true, description: 'Poids du fichier, en octets.' },
    largeur: { type: 'integer' },
    hauteur: { type: 'integer' },
    avancement: {
      type: 'object',
      description: 'Pour chaque source (fond de carte, couche), le nombre de tuiles ou d’images faites sur le total.',
      additionalProperties: { type: 'object', properties: { fait: { type: 'integer' }, total: { type: 'integer' } } },
    },
    etapes: { type: 'array', items: { type: 'string' } },
    avertissements: { type: 'array', items: { type: 'string' } },
    erreur: { type: 'string', nullable: true },
    creation: { type: 'string', format: 'date-time' },
    debut: { type: 'string', format: 'date-time', nullable: true },
    fin: { type: 'string', format: 'date-time', nullable: true },
    expiration: { type: 'string', format: 'date-time', nullable: true },
  },
};

export function openApi(version) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'cartes',
      version,
      description:
        'Cartes détaillées des communes françaises, prêtes à imprimer en grand format. ' +
        'Chaque chemin a un alias anglais : /municipalities, /basemaps, /maplayers, /estimates, /maps, /maps/{id}/file.',
    },
    security: [{ cle: [] }],
    paths: {
      '/communes': {
        get: {
          summary: 'Chercher une commune par son nom',
          parameters: [
            { name: 'nom', in: 'query', required: true, schema: { type: 'string' }, example: 'Colombiers' },
            { name: 'departement', in: 'query', schema: { type: 'string' }, example: '86' },
          ],
          responses: { 200: { description: 'Communes trouvées, peut-être aucune.' }, 400: error },
        },
      },
      '/fonds': { get: { summary: 'Lister les fonds de carte', responses: { 200: { description: 'Fonds de carte.' } } } },
      '/couches': {
        get: { summary: 'Lister les couches superposables', responses: { 200: { description: 'Couches.' } } },
      },
      '/estimations': {
        post: {
          summary: 'Estimer une carte avant de la générer',
          description:
            "Pour chaque niveau de zoom, la taille de l'image, de l'impression et de la mémoire ; " +
            'pour le zoom demandé, le poids estimé du fichier, à partir d’un échantillon de tuiles.',
          requestBody: { required: true, content: { 'application/json': { schema: MAP_REQUEST } } },
          responses: { 200: { description: 'Estimation.' }, 400: error },
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
            202: { description: 'Carte acceptée.', content: { 'application/json': { schema: MAP } } },
            400: error,
          },
        },
      },
      '/cartes/{id}': {
        get: {
          summary: 'Suivre une carte',
          parameters: [id],
          responses: { 200: { description: 'Carte.', content: { 'application/json': { schema: MAP } } }, 404: error },
        },
        delete: {
          summary: 'Annuler une carte, ou supprimer une carte terminée',
          parameters: [id],
          responses: { 200: { description: 'Carte.', content: { 'application/json': { schema: MAP } } }, 404: error },
        },
      },
      '/cartes/{id}/fichier': {
        get: {
          summary: 'Télécharger une carte terminée',
          parameters: [id],
          responses: {
            200: {
              description: 'Image de la carte.',
              content: { 'image/png': {}, 'image/jpeg': {}, 'image/tiff': {} },
            },
            404: error,
            409: error,
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
        Erreur: {
          description: 'Erreur, décrite en français.',
          content: {
            'application/json': { schema: { type: 'object', properties: { erreur: { type: 'string' } } } },
          },
        },
      },
    },
  };
}
