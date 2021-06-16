import * as React from "react";
import OrderBook from "../../components/order-book/order-book/order-book";
import useWebSocket from "react-use-websocket";
import { bookUi1FeedConsts } from "../../consts";
import {
  ORDER_BOOK,
  ORDER_BOOK_EVENT,
} from "../../machines/order-book-machine-types";
import Footer from "../../components/footer/footer";
import { useOrderBookMachineSend } from "../../contexts/useOrderBookMachineSend";
import { useOrderBookMachineState } from "../../contexts/useOrderBookMachineState";
import ErrorBoundary from "../../components/error-boundary/error-boundary";

export interface OrderBookContainerEthProps {}

const OrderBookContainerEth: React.FC<OrderBookContainerEthProps> = () => {
  const send = useOrderBookMachineSend();
  const state = useOrderBookMachineState();

  // Configure WS connection to Crypto Facilities
  const { REACT_APP_CF_SOCKET_URL } = process.env;
  const socketUrl = `${REACT_APP_CF_SOCKET_URL}`;

  const {
    sendJsonMessage,
    lastJsonMessage,
    // readyState,
  } = useWebSocket(socketUrl, {
    onOpen: () => {
      send({ type: ORDER_BOOK_EVENT.OPEN_CONNECTION });

      try {
        // Send the initial message to open the WS connection
        sendJsonMessage({
          event: bookUi1FeedConsts.events.subscribe,
          feed: bookUi1FeedConsts.name,
          product_ids: [bookUi1FeedConsts.productIds.ethusd],
        });
      } catch (error) {
        send({ type: ORDER_BOOK_EVENT.ERROR });
      }
    },
    onError: () => {
      console.error("Error connecting to CF");
      send({ type: ORDER_BOOK_EVENT.ERROR });
    },
    onMessage: () => {
      if (state.matches(ORDER_BOOK.IDLE)) {
        send({
          type: ORDER_BOOK_EVENT.UPDATE_ORDERS,
          asks: !!lastJsonMessage.asks ? lastJsonMessage.asks : [],
          bids: !!lastJsonMessage.bids ? lastJsonMessage.bids : [],
        });
      }
    },
    shouldReconnect: () => true,
  });

  // Hydrate the store
  React.useEffect(() => {
    // If the state is loading, check the last message for a snapshot to be used for hydration
    if (state.matches(ORDER_BOOK.LOADING)) {
      if (
        !!lastJsonMessage &&
        lastJsonMessage.feed === bookUi1FeedConsts.snapshot
      ) {
        send({
          type: ORDER_BOOK_EVENT.HYDRATE,
          asks: !!lastJsonMessage.asks ? lastJsonMessage.asks : [],
          bids: !!lastJsonMessage.bids ? lastJsonMessage.bids : [],
        });
      }
    }
  }, [send, lastJsonMessage, state]);

  return (
    <>
      <ErrorBoundary>
        <OrderBook
          sellSideRowsData={state.context.asks}
          buySideRowsData={state.context.bids}
          machineState={state}
        />

        <Footer cfSocketSendJsonMessage={sendJsonMessage} />
      </ErrorBoundary>
    </>
  );
};

export default OrderBookContainerEth;
