const {test} = require('tap');

const {addPeer} = require('./../../');

const tests = [
  {
    args: {},
    description: 'LND is required',
    error: [400, 'ExpectedLndToAddPeer'],
  },
  {
    args: {lnd: {}},
    description: 'LND with default methods is required',
    error: [400, 'ExpectedLndToAddPeer'],
  },
  {
    args: {lnd: {default: {}}},
    description: 'LND with connectPeer method is required',
    error: [400, 'ExpectedLndToAddPeer'],
  },
  {
    args: {lnd: {default: {connectPeer: ({}, cbk) => {}}}},
    description: 'Peer public key is required',
    error: [400, 'ExpectedPublicKeyOfPeerToAdd'],
  },
  {
    args: {lnd: {default: {connectPeer: ({}, cbk) => {}}}, public_key: 1},
    description: 'Peer public key is required',
    error: [400, 'ExpectedPublicKeyOfPeerToAdd'],
  },
  {
    args: {lnd: {default: {connectPeer: ({}, cbk) => {}}}, public_key: '00'},
    description: 'Peer public key is required',
    error: [400, 'UnexpectedLengthOfPublicKeyToAdd'],
  },
  {
    args: {
      lnd: {default: {connectPeer: ({}, cbk) => {}}},
      public_key: Buffer.alloc(33).toString('hex'),
    },
    description: 'Peer socket is required',
    error: [400, 'ExpectedHostAndPortOfPeerToAdd'],
  },
  {
    args: {
      lnd: {
        default: {
          connectPeer: ({}, cbk) => cbk({message: 'already.connected.to'}),
        },
      },
      public_key: Buffer.alloc(33).toString('hex'),
      socket: 'socket',
    },
    description: 'Already connected returns early',
  },
  {
    args: {
      lnd: {
        default: {
          connectPeer: ({}, cbk) => cbk({message: 'connection.to.self'}),
        },
      },
      public_key: Buffer.alloc(33).toString('hex'),
      socket: 'socket',
    },
    description: 'Connection to self returns early',
  },
  {
    args: {
      lnd: {
        default: {
          connectPeer: ({}, cbk) => cbk({
            details: 'chain backend is still syncing, server not active yet',
          }),
        },
      },
      public_key: Buffer.alloc(33).toString('hex'),
      retry_count: 0,
      socket: 'socket',
    },
    description: 'Still syncing returns known error',
    error: [503, 'FailedToAddPeerBecausePeerStillSyncing'],
  },
  {
    args: {
      lnd: {default: {connectPeer: ({}, cbk) => cbk('e')}},
      public_key: Buffer.alloc(33).toString('hex'),
      retry_count: 0,
      socket: 'socket',
    },
    description: 'Random error returns error',
    error: [503, 'UnexpectedErrorAddingPeer', {err: 'e'}],
  },
  {
    args: {
      lnd: {
        default: {
          connectPeer: ({}, cbk) => cbk(null, {}),
          listPeers: ({}, cbk) => cbk('err'),
        },
      },
      public_key: Buffer.alloc(33).toString('hex'),
      retry_count: 0,
      socket: 'socket',
    },
    description: 'List peers error returns error',
    error: [503, 'UnexpectedGetPeersError', {err: 'err'}],
  },
  {
    args: {
      lnd: {
        default: {
          connectPeer: ({}, cbk) => cbk(null, {}),
          listPeers: ({}, cbk) => cbk(null, {peers: []}),
        },
      },
      public_key: Buffer.alloc(33).toString('hex'),
      retry_count: 0,
      socket: 'socket',
    },
    description: 'List peers error returns error',
    error: [503, 'FailedToSuccessfullyConnectToRemotePeer'],
  },
  {
    args: {
      lnd: {
        default: {
          connectPeer: ({}, cbk) => cbk(null, {}),
          listPeers: ({}, cbk) => cbk(null, {peers: [{
            address: 'address',
            bytes_recv: '0',
            bytes_sent: '0',
            inbound: false,
            ping_time: '0',
            pub_key: Buffer.alloc(33).toString('hex'),
            sat_recv: '0',
            sat_sent: '0',
            sync_type: 'ACTIVE_SYNC',
          }]}),
        },
      },
      public_key: Buffer.alloc(33).toString('hex'),
      retry_count: 0,
      socket: 'socket',
    },
    description: 'List peers error returns error',
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async ({deepEqual, end, equal, rejects}) => {
    if (!!error) {
      rejects(() => addPeer(args), error, 'Got expected error');
    } else {
      await addPeer(args);
    }

    return end();
  });
});
