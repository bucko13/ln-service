const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {chanFormat} = require('bolt07');
const {returnResult} = require('asyncjs-util');

const {isLnd} = require('./../grpc');

const decBase = 10;
const {isArray} = Array;
const msPerSec = 1e3;

/** Get channels

  `is_static_remote_key` will be undefined on LND 0.7.1 and below

  `cooperative_close_address` is not supported on LND 0.8.2 and below
  `time_offline` and `time_online` will be undefined on 0.8.2 and below

  {
    [is_active]: <Limit Results To Only Active Channels Bool> // false
    [is_offline]: <Limit Results To Only Offline Channels Bool> // false
    [is_private]: <Limit Results To Only Private Channels Bool> // false
    [is_public]: <Limit Results To Only Public Channels Bool> // false
    lnd: <Authenticated LND gRPC API Object>
  }

  @returns via cbk or Promise
  {
    channels: [{
      capacity: <Channel Token Capacity Number>
      commit_transaction_fee: <Commit Transaction Fee Number>
      commit_transaction_weight: <Commit Transaction Weight Number>
      [cooperative_close_address]: <Coop Close Restricted to Address String>
      id: <Standard Format Channel Id String>
      is_active: <Channel Active Bool>
      is_closing: <Channel Is Closing Bool>
      is_opening: <Channel Is Opening Bool>
      is_partner_initiated: <Channel Partner Opened Channel Bool>
      is_private: <Channel Is Private Bool>
      [is_static_remote_key]: <Remote Key Is Static Bool>
      local_balance: <Local Balance Tokens Number>
      local_reserve: <Local Reserved Tokens Number>
      partner_public_key: <Channel Partner Public Key String>
      pending_payments: [{
        id: <Payment Preimage Hash Hex String>
        is_outgoing: <Payment Is Outgoing Bool>
        timeout: <Chain Height Expiration Number>
        tokens: <Payment Tokens Number>
      }]
      received: <Received Tokens Number>
      remote_balance: <Remote Balance Tokens Number>
      remote_reserve: <Remote Reserved Tokens Number>
      sent: <Sent Tokens Number>
      [time_offline]: <Monitoring Uptime Channel Down Milliseconds Number>
      [time_online]: <Monitoring Uptime Channel Up Milliseconds Number>
      transaction_id: <Blockchain Transaction Id String>
      transaction_vout: <Blockchain Transaction Vout Number>
      unsettled_balance: <Unsettled Balance Tokens Number>
    }]
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isLnd({lnd: args.lnd, method: 'listChannels', type: 'default'})) {
          return cbk([400, 'ExpectedLndToGetChannels']);
        }

        return cbk();
      },

      // Get channels
      getChannels: ['validate', ({}, cbk) => {
        return args.lnd.default.listChannels({
          active_only: !!args.is_active ? true : undefined,
          inactive_only: !!args.is_offline ? true : undefined,
          private_only: !!args.is_private ? true : undefined,
          public_only: !!args.is_public ? true : undefined,
        },
        (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedGetChannelsError', {err}]);
          }

          if (!res || !isArray(res.channels)) {
            return cbk([503, 'ExpectedChannelsArray']);
          }

          return cbk(null, res.channels);
        });
      }],

      // Map channel response to channels list
      mappedChannels: ['getChannels', ({getChannels}, cbk) => {
        return asyncMap(getChannels, (channel, cbk) => {
          if (channel.active === undefined) {
            return cbk([503, 'ExpectedChannelActiveState']);
          }

          if (channel.capacity === undefined) {
            return cbk([503, 'ExpectedChannelCapacity']);
          }

          try {
            const _ = chanFormat({number: channel.chan_id});
          } catch (err) {
            return cbk([503, 'ExpectedChannelIdNumberInChannelsList', {err}]);
          }

          if (!channel.channel_point) {
            return cbk([503, 'ExpectedChannelPoint']);
          }

          if (channel.commit_fee === undefined) {
            return cbk([503, 'ExpectedCommitFee']);
          }

          if (channel.commit_weight === undefined) {
            return cbk([503, 'ExpectedCommitWeight']);
          }

          if (channel.fee_per_kw === undefined) {
            return cbk([503, 'ExpectedFeePerKw']);
          }

          if (channel.local_balance === undefined) {
            return cbk([503, 'ExpectedLocalBalance']);
          }

          if (!channel.local_chan_reserve_sat) {
            return cbk([503, 'ExpectedLocalChannelReserveAmountInChannel']);
          }

          if (channel.num_updates === undefined) {
            return cbk([503, 'ExpectedNumUpdates']);
          }

          if (!isArray(channel.pending_htlcs)) {
            return cbk([503, 'ExpectedChannelPendingHtlcs']);
          }

          if (channel.private !== true && channel.private !== false) {
            return cbk([503, 'ExpectedChannelPrivateStatus']);
          }

          if (channel.remote_balance === undefined) {
            return cbk([503, 'ExpectedRemoteBalance']);
          }

          if (!channel.remote_chan_reserve_sat) {
            return cbk([503, 'ExpectedRemoteChannelReserveAmount']);
          }

          if (!channel.remote_pubkey) {
            return cbk([503, 'ExpectedRemotePubkey']);
          }

          if (channel.total_satoshis_received === undefined) {
            return cbk([503, 'ExpectedTotalSatoshisReceived']);
          }

          if (channel.total_satoshis_sent === undefined) {
            return cbk([503, 'ExpectedTotalSatoshisSent']);
          }

          if (channel.unsettled_balance === undefined) {
            return cbk([503, 'ExpectedUnsettledBalance']);
          }

          const commitWeight = parseInt(channel.commit_weight, decBase);
          const localReserve = channel.local_chan_reserve_sat;
          const remoteReserve = channel.remote_chan_reserve_sat;
          const [transactionId, vout] = channel.channel_point.split(':');

          const localReserveTokens = parseInt(localReserve, decBase);
          const remoteReserveTokens = parseInt(remoteReserve, decBase);

          const uptime = Number(channel.uptime) * msPerSec;

          const downtime = Number(channel.lifetime) * msPerSec - uptime;

          return cbk(null, {
            capacity: parseInt(channel.capacity, decBase),
            commit_transaction_fee: parseInt(channel.commit_fee, decBase),
            commit_transaction_weight: commitWeight,
            cooperative_close_address: channel.close_address || undefined,
            id: chanFormat({number: channel.chan_id}).channel,
            is_active: channel.active,
            is_closing: false,
            is_opening: false,
            is_partner_initiated: !channel.initiator,
            is_private: channel.private,
            is_static_remote_key: channel.static_remote_key || undefined,
            local_balance: parseInt(channel.local_balance, decBase),
            local_reserve: localReserveTokens || undefined,
            partner_public_key: channel.remote_pubkey,
            pending_payments: channel.pending_htlcs.map(n => ({
              id: n.hash_lock.toString('hex'),
              is_outgoing: !n.incoming,
              timeout: n.expiration_height,
              tokens: parseInt(n.amount, decBase),
            })),
            received: parseInt(channel.total_satoshis_received, decBase),
            remote_balance: parseInt(channel.remote_balance, decBase),
            remote_reserve: remoteReserveTokens || undefined,
            sent: parseInt(channel.total_satoshis_sent, decBase),
            time_offline: downtime || undefined,
            time_online: uptime || undefined,
            transaction_id: transactionId,
            transaction_vout: parseInt(vout, decBase),
            unsettled_balance: parseInt(channel.unsettled_balance, decBase),
          });
        },
        cbk);
      }],

      // Final channels result
      channels: ['mappedChannels', ({mappedChannels}, cbk) => {
        return cbk(null, {channels: mappedChannels});
      }],
    },
    returnResult({reject, resolve, of: 'channels'}, cbk));
  });
};
