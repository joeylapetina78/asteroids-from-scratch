export const WORLD_RECORD_RELATIONSHIPS = Object.freeze({
  APPLIES_TO: "applies-to",
  COLLATERALIZES: "collateralizes",
  CONTROLS: "controls",
  HELD_BY: "held-by",
  ISSUED_BY: "issued-by",
  OWNS: "owns",
});

export function ensureWorldRecords(state) {
  if (!state.worldRecords) {
    state.worldRecords = createEmptyWorldRecords();
  }

  state.worldRecords.entities ??= {};
  state.worldRecords.documents ??= {};
  state.worldRecords.relationships ??= {};

  return state.worldRecords;
}

export function createEmptyWorldRecords() {
  return {
    entities: {},
    documents: {},
    relationships: {},
  };
}

export function upsertWorldEntity(state, entity) {
  const records = ensureWorldRecords(state);
  records.entities[entity.id] = {
    ...(records.entities[entity.id] ?? {}),
    ...entity,
    updatedAt: Date.now(),
  };
  return records.entities[entity.id];
}

export function upsertWorldDocument(state, document) {
  const records = ensureWorldRecords(state);
  records.documents[document.id] = {
    ...(records.documents[document.id] ?? {}),
    ...document,
    updatedAt: Date.now(),
  };
  return records.documents[document.id];
}

export function upsertWorldRelationship(state, relationship) {
  const records = ensureWorldRecords(state);
  const id = relationship.id ?? getRelationshipId(relationship);
  records.relationships[id] = {
    ...(records.relationships[id] ?? {}),
    ...relationship,
    id,
    updatedAt: Date.now(),
  };
  return records.relationships[id];
}

export function getWorldEntity(state, entityId) {
  return ensureWorldRecords(state).entities[entityId] ?? null;
}

export function getWorldDocument(state, documentId) {
  return ensureWorldRecords(state).documents[documentId] ?? null;
}

export function findWorldRelationships(state, { fromId = null, toId = null, type = null } = {}) {
  return Object.values(ensureWorldRecords(state).relationships).filter((relationship) => {
    if (fromId && relationship.fromId !== fromId) {
      return false;
    }
    if (toId && relationship.toId !== toId) {
      return false;
    }
    if (type && relationship.type !== type) {
      return false;
    }

    return true;
  });
}

export function findDocumentsForEntity(state, entityId, relationshipType = WORLD_RECORD_RELATIONSHIPS.APPLIES_TO) {
  const records = ensureWorldRecords(state);
  return findWorldRelationships(state, { toId: entityId, type: relationshipType })
    .map((relationship) => records.documents[relationship.fromId])
    .filter(Boolean);
}

export function findDocumentsHeldBy(state, holderEntityId) {
  return findDocumentsForEntity(state, holderEntityId, WORLD_RECORD_RELATIONSHIPS.HELD_BY);
}

export function ensureInstitution(state, { id, name, authorityScope = [] }) {
  return upsertWorldEntity(state, {
    id,
    type: "institution",
    name,
    authorityScope,
  });
}

export function ensurePerson(state, { id, name, licenseId = null }) {
  return upsertWorldEntity(state, {
    id,
    type: "person",
    name,
    licenseId,
  });
}

export function ensureShipAsset(state, { vin, name, frameId = null }) {
  return upsertWorldEntity(state, {
    id: getShipAssetId(vin),
    type: "asset",
    assetType: "ship",
    vin,
    name,
    frameId,
  });
}

export function issueWorldDocument(state, { document, issuerEntityId, holderEntityId = null, assetEntityId = null }) {
  const record = upsertWorldDocument(state, document);

  if (issuerEntityId) {
    upsertWorldRelationship(state, {
      fromId: document.id,
      toId: issuerEntityId,
      type: WORLD_RECORD_RELATIONSHIPS.ISSUED_BY,
    });
  }

  if (holderEntityId) {
    upsertWorldRelationship(state, {
      fromId: document.id,
      toId: holderEntityId,
      type: WORLD_RECORD_RELATIONSHIPS.HELD_BY,
    });
  }

  if (assetEntityId) {
    upsertWorldRelationship(state, {
      fromId: document.id,
      toId: assetEntityId,
      type: WORLD_RECORD_RELATIONSHIPS.APPLIES_TO,
    });
  }

  return record;
}

export function getShipAssetId(vin) {
  return `ship:${vin}`;
}

function getRelationshipId({ fromId, type, toId }) {
  return `${fromId}::${type}::${toId}`;
}
