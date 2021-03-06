const asyncAuto = require('async/auto');
const {featureFlagDetails} = require('bolt09');
const {isBoolean} = require('lodash');
const {isNumber} = require('lodash');
const {returnResult} = require('asyncjs-util');

const {chainId} = require('./../bolt02');
const {isLnd} = require('./../grpc');

const cannotConnectMessage = 'failed to connect to all addresses';
const connectFailMessage = '14 UNAVAILABLE: channel is in state TRANSIENT_FAILURE';
const connectionFailureLndErrorMessage = 'Connect Failed';
const {isArray} = Array;
const lockedLndErrorMessage = 'unknown service lnrpc.Lightning';
const msPerSec = 1e3;

/** Get overall wallet info.

  LND 0.8.2 and below do not return `features`

  {
    lnd: <Authenticated LND gRPC API Object>
  }

  @returns via cbk or Promise
  {
    active_channels_count: <Active Channels Count Number>
    alias: <Node Alias String>
    chains: [<Chain Id Hex String>]
    color: <Node Color String>
    current_block_hash: <Best Chain Hash Hex String>
    current_block_height: <Best Chain Height Number>
    features: [{
      bit: <BOLT 09 Feature Bit Number>
      is_known: <Feature is Known Bool>
      is_required: <Feature Support is Required Bool>
      type: <Feature Type String>
    }]
    is_synced_to_chain: <Is Synced To Chain Bool>
    [is_synced_to_graph]: <Is Synced To Network Graph Bool>
    latest_block_at: <Latest Known Block At Date String>
    peers_count: <Peer Count Number>
    pending_channels_count: <Pending Channels Count Number>
    public_key: <Public Key String>
    [uris]: [<The URIs of the Node String>]
    version: <LND Version String>
  }
*/
module.exports = ({lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isLnd({lnd, method: 'getInfo', type: 'default'})) {
          return cbk([400, 'ExpectedAuthenticatedLndGrpcForGetInfoRequest']);
        }

        return cbk();
      },

      // Get wallet info
      getWalletInfo: ['validate', ({}, cbk) => {
        return lnd.default.getInfo({}, (err, res) => {
          if (!!err && err.details === lockedLndErrorMessage) {
            return cbk([503, 'LndLocked']);
          }

          if (!!err && err.details === cannotConnectMessage) {
            return cbk([503, 'FailedToConnectToDaemon']);
          }

          if (!!err && err.details === connectionFailureLndErrorMessage) {
            return cbk([503, 'FailedToConnectToDaemon']);
          }

          if (!!err && err.message === connectFailMessage) {
            return cbk([503, 'FailedToConnectToDaemon']);
          }

          if (!!err) {
            return cbk([503, 'GetWalletInfoErr', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedWalletResponse']);
          }

          if (typeof res.alias !== 'string') {
            return cbk([503, 'ExpectedWalletAlias']);
          }

          if (!res.best_header_timestamp) {
            return cbk([503, 'ExpectedBestHeaderTimestampInInfoResponse']);
          }

          if (typeof res.block_hash !== 'string') {
            return cbk([503, 'ExpectedCurrentBlockHash']);
          }

          if (!isNumber(res.block_height)) {
            return cbk([503, 'ExpectedBlockHeight']);
          }

          if (!isArray(res.chains)) {
            return cbk([503, 'ExpectedChainsAssociatedWithWallet']);
          }

          if (!res.color) {
            return cbk([503, 'ExpectedWalletColorInWalletInfoResponse']);
          }

          if (!res.identity_pubkey) {
            return cbk([503, 'ExpectedIdentityPubkey']);
          }

          if (!isNumber(res.num_active_channels)) {
            return cbk([503, 'ExpectedNumActiveChannels']);
          }

          if (!isNumber(res.num_peers)) {
            return cbk([503, 'ExpectedNumPeers']);
          }

          if (!isNumber(res.num_pending_channels)) {
            return cbk([503, 'ExpectedNumPendingChannels']);
          }

          if (!isBoolean(res.synced_to_chain)) {
            return cbk([503, 'ExpectedSyncedToChainStatus']);
          }

          if (!isArray(res.uris)) {
            return cbk([503, 'ExpectedArrayOfUrisInWalletInfoResponse']);
          }

          if (typeof res.version !== 'string') {
            return cbk([503, 'ExpectedWalletLndVersion']);
          }

          const chains = res.chains
            .map(({chain, network}) => chainId({chain, network}).chain)
            .filter(n => !!n);

          const latestBlockAt = new Date(res.best_header_timestamp * msPerSec);

          return cbk(null, {
            chains,
            color: res.color,
            active_channels_count: res.num_active_channels,
            alias: res.alias,
            current_block_hash: res.block_hash,
            current_block_height: res.block_height,
            features: Object.keys(res.features).map(bit => ({
              bit: Number(bit),
              is_known: res.features[bit].is_known,
              is_required: res.features[bit].is_required,
              type: featureFlagDetails({bit}).type,
            })),
            is_synced_to_chain: res.synced_to_chain,
            is_synced_to_graph: !res.synced_to_graph ? undefined : true,
            latest_block_at: latestBlockAt.toISOString(),
            peers_count: res.num_peers,
            pending_channels_count: res.num_pending_channels,
            public_key: res.identity_pubkey,
            uris: res.uris,
            version: res.version,
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'getWalletInfo'}, cbk));
  });
};
