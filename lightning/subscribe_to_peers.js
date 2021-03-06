const EventEmitter = require('events');

const {isLnd} = require('./../grpc');

const method = 'subscribePeerEvents';
const unimplementedMessage = 'unknown service lnrpc.Lightning';

/** Subscribe to peer connectivity events

  LND 0.8.2 and below do not support peer subscriptions

  {
    lnd: <Authenticated LND gRPC API Object>
  }

  @throws
  <Error>

  @returns
  <EventEmitter Object>

  @event 'connected'
  {
    public_key: <Connected Peer Public Key Hex String>
  }

  @event 'disconnected'
  {
    public_key: <Disconnected Peer Public Key Hex String>
  }
*/
module.exports = ({lnd}) => {
  if (!isLnd({lnd, method, type: 'default'})) {
    throw new Error('ExpectedAuthenticatedLndToSubscribeToPeers');
  }

  const emitter = new EventEmitter();
  const subscription = lnd.default[method]({});

  const emitError = err => {
    // Exit early when no one is listening to the error
    if (!emitter.listenerCount('error')) {
      return;
    }

    if (err.details === unimplementedMessage) {
      return emitter.emit('error', new Error('SubscribeToPeersNotSupported'));
    }

    return emitter.emit('error', err);
  };

  subscription.on('data', peer => {
    if (!peer) {
      return emitError(new Error('ExpectedPeerInPeerEventData'));
    }

    if (!peer.pub_key) {
      return emitError(new Error('ExpectedPeerPublicKeyInPeerEventData'));
    }

    switch (peer.type) {
    case 'PEER_OFFLINE':
      return emitter.emit('disconnected', {public_key: peer.pub_key});

    case 'PEER_ONLINE':
      return emitter.emit('connected', {public_key: peer.pub_key});

    default:
      return emitError(new Error('UnexpectedPeerTypeInPeerEventData'));
    }
  });

  subscription.on('end', () => emitter.emit('end', {}));
  subscription.on('error', err => emitError(err));
  subscription.on('status', status => emitter.emit('status', status));

  return emitter;
};
