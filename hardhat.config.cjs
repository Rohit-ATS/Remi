// Hardhat is here for one job: `npm run chain` gives a local EVM on 8545 with
// funded accounts, so the whole product runs offline with no faucet and no
// testnet. Contracts are compiled by scripts/compile.mjs with solc directly,
// so nothing here configures compilation.

// The chain starts seven months in the past. Block timestamps can only move
// forward, so a node that boots at "now" can never be given a history — and
// Books, the Passport and the income score are all worth nothing without one.
// `npm run demo` walks the clock forward from here to today.
const sevenMonthsAgo = new Date();
sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);

module.exports = {
  networks: {
    hardhat: {
      chainId: 31337,
      initialDate: sevenMonthsAgo.toISOString(),
      // Mining on every transaction keeps settlement timing honest in the UI:
      // a payout confirms when it is actually included, not on an interval.
      mining: { auto: true, interval: 0 },
    },
  },
};
