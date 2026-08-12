// What the hubs are asking to have dug up — one book, for the whole world.
//
// WHY THIS EXISTS: this was stored once per mining company. Every operation
// called `getPostedMiningOrders` itself and kept the result in its own
// `postedOrders`, and then two outside readers took CINDER's private copy to be
// the world's: `contractBoard` rendered the public job board from it, and
// `hubInventory` searched every operation's copy for whichever happened to hold
// an order. A fact one company could see and another could not was quietly
// authoritative for everybody.
//
// That is the `actorRegistry` story again: a global fact with N homes, and each
// consumer hand-rolling its own way to find it.
//
// THE STORE LIVES HERE AND THE DERIVATION DOES NOT. `hubInventory` needs to
// read the book and `miningOperation` already imports `hubInventory`, so
// putting the derivation here too would close an import cycle. Keeping this
// module dependency-free means anything may read the book without dragging the
// mining operation in behind it.
//
// Filled during OBSERVE, before anybody acts on it. `miningOperation` owns
// working out what belongs in it.

export function ensureMiningOrderBook(state) {
  state.miningOrderBook ??= { orders: {}, at: null };
  state.miningOrderBook.orders ??= {};
  return state.miningOrderBook;
}

export function getMiningOrderBook(state) {
  return ensureMiningOrderBook(state).orders;
}

export function getPostedMiningOrder(state, orderId) {
  return getMiningOrderBook(state)[orderId] ?? null;
}

// Replace the contents IN PLACE rather than swapping the object, so a reader
// holding the orders object keeps seeing the truth instead of a snapshot that
// quietly went stale.
export function setMiningOrderBook(state, posted, at = Date.now()) {
  const book = ensureMiningOrderBook(state);
  Object.keys(book.orders).forEach((orderId) => {
    if (!posted[orderId]) delete book.orders[orderId];
  });
  Object.entries(posted).forEach(([orderId, order]) => { book.orders[orderId] = order; });
  book.at = at;
  return book;
}
