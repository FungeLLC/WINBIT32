// networksConfig.js
export const networks = {
	bitcoin: {
		messagePrefix: "\x19Bitcoin Signed Message:\n",
		bech32: "bc",
		bip32: {
			public: 0x0488b21e,
			private: 0x0488ade4,
		},
		pubKeyHash: 0x00,
		scriptHash: 0x05,
		wif: 0x80,
	},
	litecoin: {
		messagePrefix: "\x19Litecoin Signed Message:\n",
		bech32: "ltc",
		bip32: {
			public: 0x019da462,
			private: 0x019d9cfe,
		},
		pubKeyHash: 0x30,
		scriptHash: 0x32,
		wif: 0xb0,
	},
	ethereum: {
		chainId: 1,
		networkId: 1,
	},
	binanceSmartChain: {
		chainId: 56,
		networkId: 56,
	},
	arbitrum: {
		chainId: 42161,
		networkId: 42161,
	},
	avalanche: {
		chainId: 43114,
		networkId: 43114,
	},
	base: {
		chainId: 8453,
		networkId: 8453,
	},
	bitcoinCash: {
		messagePrefix: "\x18Bitcoin Cash Signed Message:\n",
		pubKeyHash: 0x00,
		scriptHash: 0x05,
		wif: 0x80,
	},
	cosmos: {
		bech32: "cosmos",
	},
	dash: {
		messagePrefix: "\x19Dash Signed Message:\n",
		pubKeyHash: 0x4c,
		scriptHash: 0x10,
		wif: 0xcc,
	},
	dogecoin: {
		messagePrefix: "\x19Dogecoin Signed Message:\n",
		pubKeyHash: 0x1e,
		scriptHash: 0x16,
		wif: 0x9e,
	},
	kujira: {
		bech32: "kujira",
	},
	maya: {
		bech32: "maya",
	},
	optimism: {
		chainId: 10,
		networkId: 10,
	},
	polkadot: {
		ss58Prefix: 0,
	},
	chainflip: {
		network: "flip",
	},
	polygon: {
		chainId: 137,
		networkId: 137,
	},
	radix: {
		networkId: 0,
	},
	thorchain: {
		bech32: "thor",
	},
	solana: {
		network: "mainnet-beta",
	},
};


const showKeyForNetwork = (privateKey, networkName) => {
	try {
		const network = networks[networkName];
		const keyPair = ec.keyFromPrivate(privateKey, "hex");
		const pubKey = keyPair.getPublic("hex");
		console.log(`${networkName} private key:`, privateKey);
		console.log(`${networkName} public key:`, pubKey);
	} catch (error) {
		console.error(`Error showing ${networkName} key:`, error);
	}
};

const showEthereumKey = (privateKey) => {
	try {
		const wallet = new ethers.Wallet(privateKey);
		console.log("Ethereum private key:", privateKey);
		console.log("Ethereum address:", wallet.address);
	} catch (error) {
		console.error("Error showing Ethereum key:", error);
	}
};


export 	const supportedCoins = [
	{
		name: "bitcoin",
		derivePath: "m/44'/0'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "bitcoin"),
	},
	{
		name: "ethereum",
		derivePath: "m/44'/60'/0'/0/0",
		action:  (privateKey) => showEthereumKey(privateKey),
	},
	{
		name: "litecoin",
		derivePath: "m/44'/2'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "litecoin"),
	},
	{
		name: "dogecoin",
		derivePath: "m/44'/3'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "dogecoin"),
	},
	{
		name: "dash",
		derivePath: "m/44'/5'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "dash"),
	},
	{
		name: "binance smart chain",
		derivePath: "m/44'/60'/0'/0/0",
		action: (privateKey) =>
			showKeyForNetwork(privateKey, "binance smart chain"),
	},
	{
		name: "polygon",
		derivePath: "m/44'/60'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "polygon"),
	},
	{
		name: "cosmos",
		derivePath: "m/44'/118'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "cosmos"),
	},
	{
		name: "thorchain",
		derivePath: "m/44'/931'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "thorchain"),
	},
	{
		name: "arbitrum",
		derivePath: "m/44'/60'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "arbitrum"),
	},
	{
		name: "solana",
		derivePath: "m/44'/501'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "solana"),
	},
	{
		name: "kujira",
		derivePath: "m/44'/118'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "kujira"),
	},
	{
		name: "maya protocol",
		derivePath: "m/44'/931'/0'/0/0",
		action: (privateKey) => showKeyForNetwork(privateKey, "maya protocol"),
	},
];
