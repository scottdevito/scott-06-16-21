import produce from "immer";
import { assign, Machine } from "xstate";
import { OrderBookRowsData } from "../components/order-book/order-book/order-book-types";
import { twoDimArrSort } from "../utils";
import {
  MachineContext,
  OrderBookStateSchema,
  OrderBookEvent,
  ORDER_BOOK,
  AvailableProductIds,
  IGroupEvent,
  IUpdateOrdersEvent,
  IHydrateEvent,
} from "./order-book-machine-types";
import {
  asksIngressSlice,
  groupByActiveGrouping,
  bidsIngressSlice,
} from "./order-book-machine-utils";

export const orderBookMachine = Machine<
  MachineContext,
  OrderBookStateSchema,
  OrderBookEvent
>({
  id: "orderBook",
  initial: ORDER_BOOK.DISCONNECTED,
  context: {
    asks: [],
    bids: [],
    activeGrouping: 0.5,
    activeProductId: AvailableProductIds.XBTUSD,
    hasError: false,
    isLoading: false,
  },
  states: {
    [ORDER_BOOK.DISCONNECTED]: {
      on: {
        OPEN_CONNECTION: ORDER_BOOK.LOADING,
      },
    },
    [ORDER_BOOK.IDLE]: {
      on: {
        DISCONNECT: ORDER_BOOK.DISCONNECTED,
        FETCH: ORDER_BOOK.LOADING,
        KILL: ORDER_BOOK.ERROR,
        TOGGLE: ORDER_BOOK.LOADING,
        GROUP: {
          actions: assign({
            activeGrouping: (context, event: IGroupEvent) => {
              return event.activeGrouping;
            },
            asks: (context, event: IGroupEvent) => {
              // Clear out previously grouped orders in the context
              return [];
            },
            bids: (context, event: IGroupEvent) => {
              // Clear out previously grouped orders in the context
              return [];
            },
          }),
        },
        UPDATE_ORDERS: {
          actions: assign({
            asks: (context, event: IUpdateOrdersEvent) => {
              // If the asks event array is not empty
              if (!!event?.asks && event.asks.length > 0) {
                // Return an array that's a mix of the updated old asks and new asks
                const asksArrWithUpdates = produce(
                  groupByActiveGrouping(context.asks, context.activeGrouping),
                  (draft: OrderBookRowsData) => {
                    // For each incoming ask in the event, search for a matching ask in the context (by price)
                    groupByActiveGrouping(
                      event.asks,
                      context.activeGrouping
                    ).map((ask) => {
                      const existingAskIndex = draft.findIndex(
                        (possibleExistingAsk) =>
                          possibleExistingAsk[0] === ask[0]
                      );

                      // If we find a match in the context
                      if (existingAskIndex !== -1) {
                        // The incoming ask has a size of less than 1 - remove the corresponding ask from the context
                        if (ask[1] < 1) {
                          return draft.splice(existingAskIndex, 1);
                        } else {
                          // The incoming ask has a size of > 0 - update the size of the corresponding ask in the context
                          return (draft[existingAskIndex] = ask);
                        }
                      }

                      // If we don't find a match, add the incoming ask into the context
                      if (existingAskIndex === -1) {
                        return draft.push(ask);
                      }
                    });
                  }
                );

                // Clear out all incoming asks with 0 size (we've already dealt with them)
                const newAsksArrWithoutZeros = asksArrWithUpdates.filter(
                  (updatedAsk) => {
                    return updatedAsk[1] !== 0;
                  }
                );

                // Always sort/store asks and bids in descending order
                const sortedNewAsksArrWithoutZeros =
                  newAsksArrWithoutZeros.sort(twoDimArrSort);

                // For sells, only take the bottom 30 asks
                // we need 15 but we want a buffer to ensure there's at least 15 showing in the UI
                if (sortedNewAsksArrWithoutZeros.length > 30) {
                  const bufferedAndSortedNewAsksArrWithoutZeros =
                    asksIngressSlice(sortedNewAsksArrWithoutZeros);

                  return bufferedAndSortedNewAsksArrWithoutZeros;
                } else {
                  return sortedNewAsksArrWithoutZeros;
                }
              }
              // Return the context asks if there aren't any incoming asks
              return context.asks;
            },
            bids: (context, event: IUpdateOrdersEvent) => {
              // If the bids event array is not empty
              if (!!event?.bids && event.bids.length > 0) {
                // Return an array that's a mix of the updated old bids and new bids
                const bidsArrWithUpdates = produce(
                  groupByActiveGrouping(context.bids, context.activeGrouping),
                  (draft: OrderBookRowsData) => {
                    // For each incoming bid in the event, search for a matching bid in the context (by price)
                    groupByActiveGrouping(
                      event.bids,
                      context.activeGrouping
                    ).map((bid) => {
                      const existingBidIndex = draft.findIndex(
                        (possibleExistingBid) =>
                          possibleExistingBid[0] === bid[0]
                      );

                      // If we find a match in the context
                      if (existingBidIndex !== -1) {
                        // The incoming bid has a size of less than 1 - remove the corresponding bid from the context
                        if (bid[1] < 1) {
                          return draft.splice(existingBidIndex, 1);
                        } else {
                          // The incoming bid has a size of > 0 - update the size of the corresponding bid in the context
                          return (draft[existingBidIndex] = bid);
                        }
                      }

                      // If we don't find a match, add the incoming bid into the context
                      if (existingBidIndex === -1) {
                        return draft.push(bid);
                      }
                    });
                  }
                );

                // Clear out all incoming bids with 0 size (we've already dealt with them)
                const newBidsArrWithoutZeros = bidsArrWithUpdates.filter(
                  (updatedBid) => {
                    return updatedBid[1] !== 0;
                  }
                );

                // Always sort/store bids and asks in descending order
                const sortedNewBidsArrWithoutZeros =
                  newBidsArrWithoutZeros.sort(twoDimArrSort);

                // For buys, only take the top 30 bids
                // we need 15 but we want a buffer to ensure there's at least 15 showing in the UI
                if (sortedNewBidsArrWithoutZeros.length > 30) {
                  const bufferedAndSortedNewBidsArrWithoutZeros =
                    bidsIngressSlice(sortedNewBidsArrWithoutZeros);

                  return bufferedAndSortedNewBidsArrWithoutZeros;
                } else {
                  return sortedNewBidsArrWithoutZeros;
                }
              }
              // Return the context bids if there aren't any incoming bids
              return context.bids;
            },
          }),
        },
      },
    },
    [ORDER_BOOK.LOADING]: {
      on: {
        DISCONNECT: ORDER_BOOK.DISCONNECTED,
        RESOLVE: ORDER_BOOK.IDLE,
        HYDRATE: {
          target: ORDER_BOOK.IDLE,
          actions: assign({
            asks: (_, event: IHydrateEvent) => {
              return asksIngressSlice(event.asks);
            },
            bids: (_, event: IHydrateEvent) => {
              return bidsIngressSlice(event.bids);
            },
          }),
        },
        REJECT: ORDER_BOOK.ERROR,
      },
    },
    [ORDER_BOOK.ERROR]: {
      on: {
        FETCH: ORDER_BOOK.LOADING,
      },
    },
  },
});