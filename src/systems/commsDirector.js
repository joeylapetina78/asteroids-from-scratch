export const COMMS_SOURCES = {
  hubAuthority: "hub-authority",
  serviceNpc: "service-npc",
  tow: "tow",
  worldNpc: "world-npc",
};

const DEFAULT_QUEUE_LIMIT = 8;
const DEFAULT_QUEUE_TTL_MS = 20000;
const SOURCE_PRIORITIES = {
  [COMMS_SOURCES.tow]: 80,
  [COMMS_SOURCES.hubAuthority]: 70,
  [COMMS_SOURCES.serviceNpc]: 60,
  [COMMS_SOURCES.worldNpc]: 40,
};

export function createCommsDirector({ state, journeyDirector }) {
  const queue = [];

  function say({
    speaker,
    text,
    acknowledgement = null,
    source = COMMS_SOURCES.worldNpc,
    requireIdle = false,
    queueIfBlocked = !requireIdle,
    ttlMs = DEFAULT_QUEUE_TTL_MS,
    priority = SOURCE_PRIORITIES[source] ?? 10,
  }) {
    const message = {
      id: `${source}:${speaker}:${text}:${acknowledgement?.action ?? "none"}`,
      speaker,
      text,
      acknowledgement,
      source,
      priority,
      expiresAt: Date.now() + ttlMs,
    };

    if (requireIdle && hasActiveMessage()) {
      if (queueIfBlocked) {
        enqueue(message);
      }
      return false;
    }

    const didSpeak = deliver(message);

    if (!didSpeak && queueIfBlocked) {
      enqueue(message);
    }

    return didSpeak;
  }

  function update() {
    pruneExpiredMessages();

    if (hasActiveMessage() || queue.length === 0) {
      return false;
    }

    const [nextMessage] = queue.splice(0, 1);
    return deliver(nextMessage);
  }

  function clearActiveMessage() {
    journeyDirector.clearMessage?.();
  }

  function clearPendingAcknowledgement(action = null) {
    return journeyDirector.clearPendingAcknowledgement?.(action) ?? false;
  }

  function hasActiveMessage() {
    return Boolean(state.journey.pendingAcknowledgement || state.journey.messages.length > 0);
  }

  function enqueue(message) {
    const existingIndex = queue.findIndex((queuedMessage) => queuedMessage.id === message.id);

    if (existingIndex >= 0) {
      queue[existingIndex] = {
        ...queue[existingIndex],
        ...message,
        expiresAt: Math.max(queue[existingIndex].expiresAt, message.expiresAt),
      };
    } else {
      queue.push(message);
    }

    queue.sort((a, b) => b.priority - a.priority || a.expiresAt - b.expiresAt);

    if (queue.length > DEFAULT_QUEUE_LIMIT) {
      queue.splice(DEFAULT_QUEUE_LIMIT);
    }

    return true;
  }

  function deliver(message) {
    const didSpeak = journeyDirector.sayAsNpc(message.speaker, message.text, message.acknowledgement);

    if (didSpeak) {
      state.ledger.recordEvent(
        "comms.message",
        {
          speaker: message.speaker,
          source: message.source,
          priority: message.priority,
          requiresAcknowledgement: Boolean(message.acknowledgement),
        },
        { visible: false },
      );
    }

    return didSpeak;
  }

  function pruneExpiredMessages() {
    const now = Date.now();

    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].expiresAt < now) {
        queue.splice(index, 1);
      }
    }
  }

  return {
    clearActiveMessage,
    clearPendingAcknowledgement,
    hasActiveMessage,
    say,
    update,
  };
}
