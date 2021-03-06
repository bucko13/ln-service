const EventEmitter = require('events');

const {abs} = Math;
const decBase = 10;
const msPerSec = 1e3;

/** Subscribe to transactions

  In LND 0.7.1 `block_height` is not supported

  {
    lnd: <Authenticated LND gRPC API Object>
  }

  @throws
  <Error>

  @returns
  <EventEmitter Object>

  @event 'chain_transaction'
  {
    [block_id]: <Block Hash String>
    confirmation_count: <Confirmation Count Number>
    [confirmation_height]: <Block Best Chain Tip Height Number>
    fee: <Fees Paid Tokens Number>
    id: <Transaction Id String>
    address: <address>
    is_confirmed: <Is Confirmed Bool>
    is_outgoing: <Transaction Outbound Bool>
    [output_addresses]: [<Chain Address String>]
    tokens: <Tokens Number>
  }
*/
module.exports = ({lnd}) => {
  if (!lnd || !lnd.default || !lnd.default.subscribeTransactions) {
    throw new Error('ExpectedAuthenticatedLndToSubscribeToTransactions');
  }

  const eventEmitter = new EventEmitter();
  const subscription = lnd.default.subscribeTransactions({});

  subscription.on('data', tx => {
    if (!tx) {
      return eventEmitter.emit('error', new Error('ExpectedTxInDataEvent'));
    }

    if (!tx.time_stamp) {
      return eventEmitter.emit('error', new Error('ExpectedTxTimeStamp'));
    }

    if (!tx.tx_hash) {
      return eventEmitter.emit('error', new Error('ExpectedTxIdInTxEvent'));
    }

    const createdAt = parseInt(tx.time_stamp, decBase);

    return eventEmitter.emit('chain_transaction', {
      block_id: tx.block_hash || undefined,
      confirmation_count: tx.num_confirmations,
      confirmation_height: tx.block_height || undefined,
      created_at: new Date(createdAt * msPerSec).toISOString(),
      fee: parseInt(tx.total_fees, decBase),
      id: tx.tx_hash,
      is_confirmed: !!tx.block_hash,
      is_outgoing: parseInt(tx.amount, decBase) < 0,
      output_addresses: tx.dest_addresses,
      tokens: abs(parseInt(tx.amount, decBase)),
    });
  });

  subscription.on('end', () => eventEmitter.emit('end'));
  subscription.on('error', err => eventEmitter.emit('error', err));
  subscription.on('status', status => eventEmitter.emit('status', status));

  return eventEmitter;
};
