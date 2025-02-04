import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useMemo,
	useCallback,
} from "react";
import { ChainflipBroker } from "../plugins/chainflip/broker.ts";	
import { ChainflipToolbox } from "../plugins/substrateToolboxFactory.ts";
import { createSwapKit, Chain,  SubstrateChains,
  EVMChains, 
  UTXOChains,
  CosmosChains } from "@swapkit/sdk";
import { walletconnectWallet } from "@swapkit/wallet-wc";
import { result } from "lodash";
import { secureKeystoreWallet } from '../wallets/secureKeystore/index.ts';
import { Keyring } from "@polkadot/api";
import { ChainflipPlugin } from "../plugins/chainflip/plugin.ts";
import { ThorchainPlugin, MayachainPlugin } from "@swapkit/plugin-thorchain"; 
// import { coinbaseWallet } from "@swapkit/wallet-coinbase";
// import { evmWallet } from "@swapkit/wallet-evm-extensions";
// import { keepkeyWallet } from "@swapkit/wallet-keepkey";
// import { keplrWallet } from "@swapkit/wallet-keplr";
// import { ledgerWallet } from "@swapkit/wallet-ledger";
// import { okxWallet } from "@swapkit/wallet-okx";
// import { phantomWallet } from "@swapkit/wallet-phantom";
// import { polkadotWallet } from "@swapkit/wallet-polkadotjs";
// import { talismanWallet } from "@swapkit/wallet-talisman";
// import { trezorWallet } from "@swapkit/wallet-trezor";"
import { ctrlWallet, CTRL_SUPPORTED_CHAINS } from "../wallets/wallet-ctrl";
import {
	phantomWallet,
	PHANTOM_SUPPORTED_CHAINS,
} from "../wallets/wallet-phantom";
import { keystoreWallet } from "@swapkit/wallet-keystore";

const NETWORKS = {
  secp256k1: [
    ...EVMChains,       // All EVM chains
    ...UTXOChains,      // All UTXO chains
    ...CosmosChains,    // All Cosmos SDK chains
    Chain.Chainflip     // Chainflip uses secp256k1 despite being Substrate-based
  ],
  ed25519: [
    Chain.Solana,       // Solana
    Chain.XRD          // Radix
  ],
  sr25519: [
    Chain.Polkadot      // Only pure Substrate chain
  ]
};


const SKClientContext = createContext(null);

export const useSKClient = () => useContext(SKClientContext);

const initialState = {
	clients: {},
	wallets: [],
	chains: {},
	connectChains: [
		Chain.Ethereum,
		Chain.BinanceSmartChain,
		Chain.Avalanche,
		Chain.THORChain,
		Chain.Bitcoin,
		Chain.BitcoinCash,
		Chain.Dogecoin,
		Chain.Litecoin,
		Chain.Polkadot,
		Chain.Optimism,
		Chain.Polygon,
		Chain.Cosmos,
		Chain.Maya,
		Chain.Kujira,
		Chain.Arbitrum,
		Chain.Radix,
		Chain.Base,
		Chain.Solana,
		Chain.Chainflip
	],
	providers: [],
	tokens: [],
	chainflipBroker: {},
	chainflipToolbox: null,
};

const reducer = (state, action) => {
	switch (action.type) {
		case "ADD_CLIENT":
			return {
				...state,
				clients: { ...state.clients, [action.key]: action.client },
			};
		case "SET_WALLETS":
			return {
				...state,
				wallets: { ...state.wallets, [action.key]: action.wallets },
			};
		case "SET_CHAINS":
			return {
				...state,
				chains: { ...state.chains, [action.key]: action.chains },
			};
		case "SET_CHAINFLIPBROKER":
			return {
				...state,
				chainflipBroker: {
					...state.chainflipBroker,
					[action.key]: action.chainflipBroker,
				},
			};
		case "SET_CHAINFLIPTOOLBOX":
			if (!state.chainflipToolbox) {
				return { ...state, chainflipToolbox: { [action.key]: action.chainflipToolbox } };
			}
			return { ...state, chainflipToolbox: { ...state.chainflipToolbox, [action.key]: action.chainflipToolbox } };

		case "SET_PROVIDERS":
			return { ...state, providers: action.providers };
		case "SET_TOKENS":
			return { ...state, tokens: action.tokens };
		case "ADD_OR_UPDATE_WALLET":
			const existingWalletIndex = Array.isArray(state.wallets[action.key])
				? state.wallets[action.key].findIndex(
						(w) => w.chain === action.wallet.chain
				  )
				: -1;

			const updatedWallets = [...state.wallets[action.key]];
			if (existingWalletIndex !== -1) {
				updatedWallets[existingWalletIndex] = action.wallet;
			} else {
				updatedWallets.push(action.wallet);
			}
			return {
				...state,
				wallets: { ...state.wallets, [action.key]: updatedWallets },
			};
		case "RESET_WALLETS":
			return {
				...state,
				wallets: { ...state.wallets, [action.key]: [] },
			};
		case "UPDATE_WALLET_BALANCE":
			return {
				...state,
				wallets: {
					...state.wallets,
					[action.key]: state.wallets[action.key].map(w => 
						w.chain === action.chain 
							? { ...w, balance: action.balance }
							: w
					)
				}
			};
		default:
			return state;
	}
};

export const SKClientProviderManager = ({ children }) => {
	const [state, dispatch] = useReducer(reducer, initialState);

	const createOrSelectSKClient = useCallback(
		(key) => {
			if (state.clients[key]) {
				return state.clients[key];
			}

			console.log(secureKeystoreWallet);

			const client = createSwapKit({
				config: {
					blockchairApiKey: "A___UmqU7uQhRUl4" + "UhNzCi5LOu81LQ1T",
					covalentApiKey: "cqt_rQygB4xJkdvm8fxRcBj3MxBhCHv4",
					ethplorerApiKey: "EK-8ftjU-8Ff" + "7UfY-JuNGL",
					walletConnectProjectId: "dac706e68e589ffa15fed9bbccd825f7",

					chainflipBrokerUrl: "https://chainflip.winbit32.com",
					chainflipBrokerConfig: {
						chainflipBrokerUrl: "https://chainflip.winbit32.com",
						useChainflipSDKBroker: true,
						chainflipBrokerEndpoint: "https://chainflip.winbit32.com",
					},
					thorswapApiKey: "",
				},
				plugins: {
					...ChainflipPlugin,
					...MayachainPlugin,
					...ThorchainPlugin,
				},
				rpcUrls: {
					Chainflip: "wss://rpc.chainflip.winbit32.com",
					FLIP: "wss://rpc.chainflip.winbit32.com",
					//"https://api-chainflip.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					Ethereum:
						"https://mainnet.infura.io/v3/c3b4e673639742a89bbddcb49895d568",
					ETH: "https://api-eth-mainnet-archive.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					AVAX: "https://avalanche-mainnet.infura.io/v3/c3b4e673639742a89bbddcb49895d568",
					DOT: "https://rpc.polkadot.io",
					KUJI: "https://kujira-rpc.publicnode.com:443",
					BASE: "https://api-base-mainnet-archive.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					BSC: "https://api-bsc-mainnet-full.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					ARB: "https://api-arbitrum-mainnet-archive.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					//ARB: "https://arbitrum-mainnet.infura.io/v3/c3b4e673639742a89bbddcb49895d568",
					OP: "https://api-optimism-mainnet-archive.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					MATIC:
						"https://api-polygon-mainnet-full.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					SOL: "https://rpc.ankr.com/solana/fb4077f99c50c07e75aec9cfcebfaf971cb3fce319a807e823943f962dc04e7d",
					// XRD: "https://radix-mainnet.rpc.grove.city/v1/456359ff",
					// Radix: "https://radix-mainnet.rpc.grove.city/v1/456359ff",
				},

				wallets: {
					...walletconnectWallet,
					...keystoreWallet,
					...ctrlWallet,
					...secureKeystoreWallet,
					...phantomWallet,
				},
			});
			console.log("Created client", client);

			dispatch({ type: "ADD_CLIENT", key, client });
			loadProvidersAndTokens();

			return client;
		},
		[state.clients]
	);

	const setChainflipBroker = useCallback((key, chainflipBroker) => {
		dispatch({ type: "SET_CHAINFLIPBROKER", key, chainflipBroker });
	}, []);

	const setChainflipToolbox = useCallback((key, chainflipToolbox) => {
		dispatch({ type: "SET_CHAINFLIPTOOLBOX", key, chainflipToolbox });
	}, []);

	const setWallets = useCallback((key, wallets) => {
		dispatch({ type: "SET_WALLETS", key, wallets });
		return wallets;
	}, []);

	const addWallet = useCallback((key, wallet) => {
		dispatch({ type: "ADD_OR_UPDATE_WALLET", wallet: wallet, key: key });
	}, []);

	const resetWallets = useCallback((key) => {
		dispatch({ type: "RESET_WALLETS", key });
	}, []);

	const setChains = useCallback((key, chains) => {
		dispatch({ type: "SET_CHAINS", key, chains });
	}, []);

	const setProviders = useCallback((providers) => {
		dispatch({ type: "SET_PROVIDERS", providers });
	}, []);

	const setTokens = useCallback((tokens) => {
		dispatch({ type: "SET_TOKENS", tokens });
	}, []);

	const disconnect = useCallback(
		(key) => {
			const client = state.clients[key];
			if (client) {
				for (const chain of state.connectChains) {
					client.disconnectChain(chain);
				}
			}
		},
		[state.clients, state.connectChains]
	);

	const getChainflipToolbox = useCallback(
		async (key, chain) => {
		if (!state.chainflipToolbox || !state.chainflipToolbox[key]) {

			// if (!chain) {
			// 	throw new Error("No chain provided to getChainflipToolbox");
			// }
			try {
				let keyRing = chain?.cfKeyRing;

				if(!keyRing && chain.signer){

					keyRing = chain.signer;
				}

				const chainflipToolbox = await ChainflipToolbox({
					//providerUrl: "wss://api-chainflip.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					providerUrl:
						"wss://rpc.chainflip.winbit32.com",
					signer: keyRing,
					keyring: keyRing,
					generic: false,
				});

				//Get PublicKey by decoding unit8array keyRing.publicKey
				// const publicKey = chainflipToolbox.api.createType("AccountId", keyRingPublicKey).toString();
				// console.log("Chainflip public key", publicKey);


				console.log("Created chainflip toolbox", chainflipToolbox, keyRing);
				await chainflipToolbox.api.isReady;


				setChainflipToolbox(key, chainflipToolbox);
				return chainflipToolbox;
			} catch (e) {
				console.log("Error", e);
				throw new Error("Error creating chainflip toolbox");
			}

		}

		return state.chainflipToolbox[key];

	}, [setChainflipToolbox, state.chainflipToolbox ]);

	const registerAsBroker = useCallback(async (toolbox) => {
		const extrinsic = toolbox.api.tx.swapping?.registerAsBroker();

		console.log("Registering as broker", extrinsic);

		if (!extrinsic) {
			return false;
		}

		return await toolbox.signAndBroadcast(extrinsic);
	}, []);


	const chainflipBroker = useCallback(
		async (key, chain) => {
			if (!state.chainflipBroker || !state.chainflipBroker[key]) {
				const chainflipToolbox = await getChainflipToolbox(key, chain);

				console.log("Creating chainflip broker", chainflipToolbox, chain);
				
		
				const brokerPubKey = new Uint8Array([158, 110, 87, 118, 81, 171, 252, 12, 204, 174, 206, 219, 228, 26, 8, 230, 38, 189, 11, 212, 184, 247, 209, 83, 39, 161, 127, 35, 39, 204, 82, 4]);
				const brokerAddressRaw = new Uint8Array([158, 110, 87, 118, 81, 171, 252, 12, 204, 174, 206, 219, 228, 26, 8, 230, 38, 189, 11, 212, 184, 247, 209, 83, 39, 161, 127, 35, 39, 204, 82, 4]);
				const networkPrefix = 2112;
				const brokerKeyRing = new Keyring({ type: "sr25519", ss58Format: networkPrefix }).addFromAddress(brokerAddressRaw, brokerPubKey);
				
				// {
				// 	address: "cFMTDAyTJtVXM8qbucU1dvUSw9hFd2Vz9DLdt2CdHdLfwuvz2",
				// 	addressRaw: brokerAddressRaw,
				// 	publicKey: brokerPubKey,
				// };

				const brokerChain = {cfKeyRing: brokerKeyRing};

				const brokerToolbox = await getChainflipToolbox("broker", brokerChain);

				const chainflipBroker = await ChainflipBroker(brokerToolbox);

				console.log("Created Chainflip broker", chainflipBroker, brokerToolbox);

				// const cfAddress = chainflipToolbox.getAddress();

				// // await registerAsBroker(chainflipToolbox);

				// console.log("Chainflip address", cfAddress);
				// const cfBalance = await chainflipToolbox.getBalance(cfAddress);
				// console.log("Chainflip balance", cfBalance);

				// console.log("Created chainflip broker", chainflipBroker);

				// const amt = await AssetValue.from({
				// 	symbol: "FLIP",
				// 	value: 1000000000000000000n,
				// 	fromBaseDecimal: 18,
				// 	asyncTokenLookup: false,
				// 	asset: "ETH.FLIP",
				// });
				// //FLIP ADDRESS: 0x826180541412D574cf1336d22c0C0a287822678A
				// console.log("Funding state chainflip account with", amt.toString());
				// console.log(amt);

				// chainflipBroker.fundStateChainAccount({
				// 	evmToolbox: state.wallets[key].find(
				// 		(w) => w.chain === Chain.Ethereum
				// 	),
				// 	stateChainAccount:
				// 		"cFNPkRESkBV1h6ScrMHV88KvqhN252gUdF5bQaQ6JV4YfBLFM",
				// 	//1 FLIP
				// 	amount: amt,
				// });

				setChainflipBroker(key, chainflipBroker);
				return { broker: chainflipBroker, toolbox: chainflipToolbox };
			}



			return {
				broker: state.chainflipBroker[key],
				toolbox: state.chainflipToolbox[key],
			};
		},
		[getChainflipToolbox, setChainflipBroker, state.chainflipBroker, state.chainflipToolbox, state.wallets]
	);

	const loadProvidersAndTokens = useCallback(async () => {
		try {
			let providerResponse;
			providerResponse = await fetch("https://api.swapkit.dev/providers");

			if (providerResponse.status !== 200) {
				console.log("Error fetching providers", providerResponse);
				providerResponse = await fetch("https://dev-api.swapkit.dev/providers");
			}

			const providersUnsorted = await providerResponse.json();
			const allProviders = providersUnsorted.sort((a, b) => {
				if (a.provider === "THORSWAP" || b.provider === "MAYA") {
					return -1;
				}
				if (b.provider === "THORSWAP" || a.provider === "MAYA") {
					return 1;
				}
				return a.provider < b.provider ? -1 : 1;
			});

			//providers we can do begin with  THOR, MAYA, and CHAINFLIP
			const providers = allProviders.filter(
				(p) => p.provider.includes("THOR") || p.provider.includes("MAYA") || p.provider.includes("CHAINFLIP")
			);


			dispatch({ type: "SET_PROVIDERS", providers });

			console.log("Providers", providers);

			const tokensResponse = await Promise.all(
				providers.map(async (provider) => {
					const tokenResponse = await fetch(
						`https://api.swapkit.dev/tokens?provider=${provider.provider}`
					);
					const tokenData = await tokenResponse.json();
					if (!tokenData.tokens) {
						console.log("Error fetching tokens", tokenData);
						return [];
					}
					const tokenData2 = tokenData.tokens.map((token) => {
						if (token.identifier.includes("/")) {
							const splitImage = token.logoURI.split("/");
							const last = splitImage.pop();
							const newUrl = splitImage.join("/") + "." + last;
							token.logoURI = newUrl;
						}
						return token;
					});
					return tokenData2
						.filter((token) => token.chain !== "BNB")
						.map((token) => ({
							...token,
							provider: provider.provider,
						}));
				})
			);

			const sortedTokens = tokensResponse.flat().sort((a, b) => {
				if (a.shortCode || b.shortCode) {
					return a.shortCode ? -1 : 1;
				}
				if (a.chain === a.ticker || b.chain === b.ticker) {
					return a.chain === a.ticker ? -1 : 1;
				}
				return a.chain < b.chain ? -1 : 1;
			});

			dispatch({
				type: "SET_TOKENS",
				tokens: sortedTokens,
			});
		} catch (error) {
			console.error("Error loading initial data:", error);
		}
	}, []);

	const updateWalletBalance = useCallback(async (key, chain) => {
		const client = state.clients[key];
		if (!client) return;
	
		try {

			const balance = await client.getBalance(chain, true);
			dispatch({ 
				type: "UPDATE_WALLET_BALANCE", 
				key, 
				chain, 
				balance 
			});
		} catch (error) {
			console.error(`Error updating balance for ${chain}:`, error);
		}
	}, [state.clients]);

	useEffect(() => {
		loadProvidersAndTokens();
	}, [loadProvidersAndTokens]);

	const value = useMemo(
		() => ({
			createOrSelectSKClient,
			setWallets,
			addWallet,
			resetWallets,
			setChains,
			connectChains: state.connectChains,
			disconnect,
			chainflipBroker: (key, chain) => chainflipBroker(key, chain),
			getState: (key) => ({
				skClient: state.clients[key],
				wallets: state.wallets[key] || [],
				connectChains: state.connectChains,
				chains: state.chains[key] || {},
				providers: state.providers,
				tokens: state.tokens,
			}),
			updateWalletBalance,
		}),
		[
			createOrSelectSKClient,
			setWallets,
			addWallet,
			resetWallets,
			setChains,
			state.connectChains,
			state.clients,
			state.wallets,
			state.chains,
			state.providers,
			state.tokens,
			disconnect,
			chainflipBroker,
			updateWalletBalance,
		]
	);

	return (
		<SKClientContext.Provider value={value}>
			{children}
		</SKClientContext.Provider>
	);
};

export const useWindowSKClient = (key) => {
	const {
		createOrSelectSKClient,
		setWallets,
		getState,
		setChains,
		disconnect,
		addWallet,
		resetWallets,
		chainflipBroker,
		updateWalletBalance,
	} = useContext(SKClientContext);
	const skClient = useMemo(
		() => createOrSelectSKClient(key),
		[key, createOrSelectSKClient]
	);
	const { wallets, connectChains, chains, providers, tokens } = getState(key);

	const providerNames = useMemo(
		() =>
			providers.reduce((acc, provider) => {
				acc[provider.provider] = provider.name;
				return acc;
			}, {}),
		[providers]
	);

	const connect = useCallback(
		async (phrase, index, callback) =>{
			let promises = [];

			const pSplit = phrase.toUpperCase().trim().split(" ");
			const firstWord = pSplit[0] || '';


			if (firstWord === "WALLETCONNECT") {
				console.log("Connecting with walletconnect");

				//hide #root
				document.getElementById("root").style.display = "none";
				let w;
				try {
					const metadata = {
						name: "WINBIT32",
						description: "WINBIT32 does stuff.",
						url: "https://winbit32.com/",
						icons: ["https://winbit32.com/favicon/android-icon-192x192.png"],
					};
					const chains = [
						Chain.BinanceSmartChain,
						Chain.Ethereum,
						// Chain.THORChain,
						Chain.Avalanche,
						Chain.Arbitrum,
						// Chain.Base,
						// Chain.Optimism,
						// Chain.Polygon,
						// Chain.Maya,
						// Chain.Cosmos,
						// Chain.Kujira,
					];
					setChains(chains);

					w = await skClient.connectWalletconnect(chains, { metadata });

					if (w) {
						// w.on("disconnect", () => {
						// 	console.log("Disconnected from walletconnect");
						// 	document.getElementById("root").style.display = "block";
						// });
						// w.on("accountsChanged", (accounts) => {
						// 	console.log("Accounts changed", accounts);
						// });
						// w.on("chainChanged", (chainId) => {
						// 	console.log("Chain changed", chainId);
						// });
						// w.on("networkChanged", (networkId) => {
						// 	console.log("Network changed", networkId);
						// });

						for (const chain of chains) {
							const wallet = await skClient.getWalletWithBalance(chain);
							if (wallet) {
								promises.push(callback(wallet, chain));
							}
						}
					}
				} catch (e) {
					console.log("Error", e);
				}
				console.log("Connected with walletconnect", w);
				document.getElementById("root").style.display = "block";
				return promises;
			} else if (firstWord === "CTRL") {
				console.log("Connecting with ctrl");
				//add xdefiwallet to skclient
				const chains = CTRL_SUPPORTED_CHAINS;
				setChains(chains);

				if (!window.ctrlEthProviders){
					window.open("https://ctrl.xyz/", "_blank");
					return;
				}

					if (await skClient.connectCTRL(chains)) {
						console.log("Connected with ctrl");

						for (const chain of chains) {
							const wallet = await skClient.getWalletWithBalance(chain);
							if (wallet) {
								promises.push(callback(wallet, chain));
							}
						}
					}
				return promises;
			// } else if (firstWord === "WINBIT") {
			// 	console.log("Connecting with WinBitWallet");

			// 	const chains = [
			// 		Chain.Arbitrum,
			// 		Chain.Avalanche,
			// 		Chain.BinanceSmartChain,
			// 		Chain.Bitcoin,
			// 		Chain.BitcoinCash,
			// 		Chain.Cosmos,
			// 		Chain.Dogecoin,
			// 		Chain.Ethereum,
			// 		Chain.Kujira,
			// 		Chain.Litecoin,
			// 		Chain.Maya,
			// 		Chain.Optimism,
			// 		Chain.Polygon,
			// 		Chain.Solana,
			// 		Chain.THORChain,
			// 		// Chain.Base,
			// 	];
			// 	setChains(chains);

			// 	if (await skClient.connectWinbitWallet(chains)) {
			// 		console.log("Connected with Winbit");

			// 		for (const chain of chains) {
			// 			const wallet = await skClient.getWalletWithBalance(chain);
			// 			if (wallet) {
			// 				promises.push(callback(wallet, chain));
			// 			}
			// 		}
			// 	}
			// 	return promises;
			} else if (firstWord === "PHANTOM") {
				console.log("Connecting with Phantom");

				const chains = PHANTOM_SUPPORTED_CHAINS;

				setChains(chains);

				if (await skClient.connectPhantom(chains)) {
					console.log("Connected with Phantom");

					for (const chain of chains) {
						const wallet = await skClient.getWalletWithBalance(chain);
						if (wallet) {
							promises.push(callback(wallet, chain));
						}
					}
				}
				return promises;



			} else if (firstWord === "SECUREKEYSTORE") {
				console.log("Connecting with SecureKeystore");


				const { password, dIndex, networkOptions } =
					await skClient.promptForPassword();
						
				if (!password) {
					return;
				}
				console.log("chains", connectChains, dIndex, networkOptions);

				for (const chain of connectChains) {
					promises.push(
						skClient
							.connectSecureKeystore([chain], password, dIndex, {
								networkOptions,
							})
							.then(async () => {
								console.log("Connected to chain", chain);
								if (!result) return;
								const wallet = await skClient.getWalletWithBalance(chain);
								if (wallet) {
									callback(wallet, chain);
								}
							})
							.catch((e) => {
								console.log("Error connecting to chain", chain, e);
							})
					);
				}
				return promises;
			}
			//connect with phrase
			skClient.setEncryptedKeystore(null);

			// Set the password request function
			skClient.setPasswordRequestFunction((password) =>
				{return password;}
			);

			let chainsToConnect = connectChains;
			const ps = phrase.split(" ");
			if(ps[0] === "PK"){
				//we have a private key
				const key = ps[1].split(":");
				const keyType = key[0];
				//filter connectChains to only those that support the keyType
				chainsToConnect = connectChains.filter((chain) => {
					const networks = NETWORKS[keyType];
					if (!networks) {
						return false;
					}
					return networks.includes(chain);
				});
				phrase = key[1];

				console.log("Connecting with private key", keyType, phrase, chainsToConnect);
			}
				

			for (const chain of chainsToConnect) {
				promises.push(
					skClient
						.connectSecureKeystore([chain], phrase.trim(), index)
						.then(async () => {
							console.log("Connected to chain", chain);
							if (!result) return;
							const wallet = await skClient.getWalletWithBalance(chain);
							if (wallet) {
								callback(wallet, chain);
							}
						})
						.catch((e) => {
							console.log("Error connecting to chain", chain, e);
						})
				);
			}
			return promises;
		},
		[connectChains, setChains, skClient]
	);

	const refreshBalance = useCallback(async (chain) => {
		// Find the wallet for this chain
		const wallet = wallets.find(w => w.chain === chain);
		if (!wallet) return;
	  
		try {
		  // Use the wallet's own balance checking method instead of SKClient
		  const balance = await wallet.getBalance(wallet.address);
		  
		  addWallet(key, { 
			...wallet, 
			chain: chain.toString(),
			balance: balance
		  });
	  
		} catch (error) {
		  console.error(`Error refreshing ${chain} balance:`, error);
		}
	  }, [wallets, addWallet, key]);

	return {
		skClient,
		setWallets: (wallets) => setWallets(key, wallets),
		addWallet: (wallet) => addWallet(key, wallet),
		resetWallets: () => resetWallets(key),
		setChains: (chains) => setChains(key, chains),
		chainflipBroker: (chain) => chainflipBroker(key, chain),
		chains,
		wallets,
		connectChains,
		providers,
		providerNames,
		tokens,
		connect,
		disconnect: () => disconnect(key),
		refreshBalance,
	};
};

export const withSKClientProvider = (Component) => (props) =>
	(
		<SKClientProviderManager>
			<Component {...props} />
		</SKClientProviderManager>
	);
