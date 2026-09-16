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
    // Murmur is not a disembodied narrator. Their world commentary only exists
    // after the player has met them in Yard Exchange's back corridor. The
    // meeting handler sets this flag before delivering Murmur's introduction.
    if (String(speaker).toLowerCase() === "murmur" && !state.hubServices?.flags?.murmurMet) {
      return false;
    }

    const message = {
      id: `${source}:${speaker}:${text}:${acknowledgement?.action ?? "none"}`,
      speaker,
      text,
      acknowledgement,
      source,
      priority,
      expiresAt: Date.now() + ttlMs,
    };

    // A mission that holds the comms floor speaks alone. The message is queued
    // rather than discarded, so nothing the world wanted to say is lost — it
    // simply waits until the induction is over.
    if (journeyDirector.isCommsFloorHeld?.()) {
      enqueue(message);
      return false;
    }

    if (requireIdle && !hasRoomFor(message)) {
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

    // Deliver the first queued line there is room for. Speakers do not wait
    // for each other; a line waits only while the screen is full of other
    // speakers, or while the player is being asked something.
    const index = queue.findIndex((message) => hasRoomFor(message));
    if (index < 0) return false;
    const [nextMessage] = queue.splice(index, 1);
    return deliver(nextMessage);
  }

  // Nobody talks over a question. Otherwise a speaker can speak if they
  // already hold a line (it is replaced) or a slot is free.
  function hasRoomFor(message) {
    if (state.journey.pendingAcknowledgement) return false;
    return journeyDirector.hasRoomFor?.(message.speaker) ?? !hasActiveMessage();
  }

  function clearActiveMessage() {
    journeyDirector.clearMessage?.({ origin: "world" });
  }

  function clearPendingAcknowledgement(action = null) {
    return journeyDirector.clearPendingAcknowledgement?.(action) ?? false;
  }

  function hasActiveMessage() {
    return Boolean(state.journey.pendingAcknowledgement || state.journey.messages.length > 0);
  }

  // Drop queued lines that no longer apply — a hub's approach hails once the
  // player has docked there, or flown off. Returns how many were dropped.
  function discardQueued(predicate) {
    let dropped = 0;
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (predicate(queue[index])) {
        queue.splice(index, 1);
        dropped += 1;
      }
    }
    return dropped;
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
    const didSpeak = journeyDirector.sayAsNpc(message.speaker, message.text, message.acknowledgement, { priority: message.priority });

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
    discardQueued,
    hasActiveMessage,
    say,
    update,
  };
}
