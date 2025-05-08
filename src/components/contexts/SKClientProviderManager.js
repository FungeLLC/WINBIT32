import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useMemo,
	useCallback,
	useRef,
	useState
} from "react";
import { ChainflipBroker } from "../plugins/chainflip/broker.ts";	
import { ChainflipToolbox } from "../plugins/substrateToolboxFactory.ts";
import { 
	createSwapKit,
	Chain, 
	ChainId,
	SubstrateChains,
	EVMChains, 
	UTXOChains,
	CosmosChains 
} from "@swapkit/sdk";
import { walletconnectWallet } from "@swapkit/wallet-wc";
import { secureKeystoreWallet } from '../wallets/secureKeystore/index.ts';
import { Keyring } from "@polkadot/api";
import { ChainflipPlugin } from "../plugins/chainflip/plugin.ts";
//import { ChainflipPlugin } from "@doritokit/plugin-chainflip";
import { ThorchainPlugin, MayachainPlugin } from "@swapkit/plugin-thorchain"; 
import { ctrlWallet, CTRL_SUPPORTED_CHAINS } from "../wallets/wallet-ctrl";
import {
	phantomWallet,
	PHANTOM_SUPPORTED_CHAINS,
} from "../wallets/wallet-phantom";
import { keystoreWallet } from "@swapkit/wallet-keystore";
export { alchemyApi } from "./covalentApi.ts";
import { alchemyApi } from "./covalentApi.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { createKeyring } from "@swapkit/toolbox-substrate";
import { JupiterPlugin } from "../plugins/jupiter.ts";


// Import the new service files
import { 
	createApi, 
	loadTokens as loadTokensFromApi, 
	loadProvidersAndTokens as loadProvidersAndTokensFromApi,
	waitForTokens as waitForTokensFromApi
} from '../../services/api';

import {
	createSwapKitClient,
	getOrCreateClient as getOrCreateClientFromService,
	connectWallet as connectWalletFromService
} from '../../services/client';

// Network categorization for key types
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

const connectChains = [
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
];

const initialState = {
	clients: {},
	wallets: {},
	chains: {},
	connectChains: connectChains,
	providers: [],
	tokens: [],
	globalTokens: null,
	globalApi: null,
	chainflipBroker: {},
	chainflipToolbox: null,
};

const reducer = (state, action, tokensLoadedRef) => {
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
		case "SET_GLOBAL_TOKENS":
			// When setting global tokens, also set tokensLoadedRef if tokens are valid
			if (tokensLoadedRef && action.tokens && Array.isArray(action.tokens) && action.tokens.length > 1) {
				console.log(`SET_GLOBAL_TOKENS: Setting tokensLoadedRef to true for ${action.tokens.length} tokens`);
				tokensLoadedRef.current = action.tokens;
			}
			return {
				...state,
				globalTokens: action.tokens && action.tokens.length > 1 ? action.tokens : state.globalTokens,
				globalApi: action.api || state.globalApi,
				tokens: action.tokens && action.tokens.length > 1 ? action.tokens : state.tokens,

			};
		case "SET_TOKENS":
			return {
				...state,
				tokens: action.tokens,
			};
		case "SET_CONNECT_CHAINS":
			return {
				...state,
				connectChains: action.chains,
			};
		case "SET_CHAINFLIPTOOLBOX":
			if (!state.chainflipToolbox) {
				return { ...state, chainflipToolbox: { [action.key]: action.chainflipToolbox } };
			}
			return { ...state, chainflipToolbox: { ...state.chainflipToolbox, [action.key]: action.chainflipToolbox } };

		case "SET_PROVIDERS":
			return { ...state, providers: action.providers };
		case "ADD_OR_UPDATE_WALLET":
			const existingWalletIndex = Array.isArray(state.wallets[action.key])
				? state.wallets[action.key].findIndex(
						wallet => wallet.chain === action.wallet.chain
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
				wallets: {
					...state.wallets,
					[action.key]: updatedWallets
				}
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
							? { ...w, balance: action.balance, timestamp: action.timestamp }
							: w
					)
				}
			};
		case "SET_CLIENT":
			return {
				...state,
				clients: { ...state.clients, [action.key]: action.client },
			};
		default:
			return state;
	}
};

export const SKClientProviderManager = ({ children }) => {
	const tokensLoadedRef = useRef(false);
	const loadingTokensPromise = useRef(null);

	const [state, dispatch] = useReducer(
		(state, action) => reducer(state, action, tokensLoadedRef),
		initialState
	);
	
	// Define createApiFunction here
	const createApiFunction = useCallback(({ apiKey }) => {
		// Use the imported createApi function
		return createApi({ apiKey });
	}, []);

	// Use the imported loadTokens function
	const loadTokens = useCallback(async () => {
		return loadTokensFromApi(state.globalTokens);
	}, [state.globalTokens]);

	// Use the imported loadProvidersAndTokens function
	const loadProvidersAndTokens = useCallback(async () => {
		return loadProvidersAndTokensFromApi(state, dispatch, tokensLoadedRef);
	}, [state, dispatch, tokensLoadedRef]);

	// Load tokens immediately when component mounts
	useEffect(() => {
		if(tokensLoadedRef.current){
			return;
		}


		console.log("SKClientProviderManager mounted, loading tokens");
		if (loadingTokensPromise.current) {
			console.log("Tokens are still loading!");
			return;
		}
		console.log("Tokens are not loading");
		// Only attempt to load tokens if they're not already loaded
		if (!tokensLoadedRef.current && (!state.globalTokens || !Array.isArray(state.globalTokens) || state.globalTokens.length === 0)) {
			console.log("Tokens not loaded yet, calling loadProvidersAndTokens");
			// state.globalTokens = [{
			// 	chain: "Ethereum",
			// 	address: "0x0000000000000000000000000000000000000000",
			// 	balance: 0,
			// 	decimals: 18,
			// 	symbol: "ETH"
			// }];
			loadingTokensPromise.current = loadProvidersAndTokens()
				.then(tokens => {
					if (tokens && Array.isArray(tokens) && tokens.length > 1) {
						console.log(`Initial token load successful: ${tokens.length} tokens loaded`);
						tokensLoadedRef.current = tokens;
					}
				})
				.catch(error => {
					console.error("Failed to load tokens on mount:", error);
				});
		} else {
			console.log("Tokens already loaded, skipping initial load:", 
				tokensLoadedRef.current ? "tokensLoadedRef is true" : "tokens array exists", 
				state.globalTokens?.length || 0);
		}
	}, [loadProvidersAndTokens, tokensLoadedRef]);


	// Create a non-useState variable to hold the current createOrSelectSKClient function
	// This will help break the circular dependency
	const createOrSelectSKClientRef = useRef(null);
	const stateRef = useRef(state);

	// Keep stateRef up to date with the latest state
	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	// Create or select a SwapKit client
	const createOrSelectSKClient = useCallback(async (key, api) => {
		// Use the imported createSwapKitClient function
		const client = await createSwapKitClient(key, api);
		
		// Add the client to state
		dispatch({ type: "ADD_CLIENT", key, client });

		dispatch({ type: "SET_TOKENS", tokens: state.globalTokens });
		
		return client;
	}, [dispatch]);

	// Store the function in the ref

	// Create a SwapKit client
	const createSKClient = useCallback(async () => {
		console.log("Creating new SwapKit client");
		
		// Add a retry mechanism for token loading
		const waitForTokens = async (maxRetries = 5, retryDelay = 1000) => {
			let retries = 0;
			
			while (retries < maxRetries) {
				// Check if tokens are already loaded
				if (tokensLoadedRef.current || (state.globalTokens && state.globalApi)) {
					if (state.globalTokens && state.globalApi) {
						tokensLoadedRef.current = state.globalTokens;
					}
					return true;
				}
				
				console.log(`Tokens not loaded yet, attempt ${retries + 1}/${maxRetries}`);
				
				try {
					// Try to load tokens
					await loadProvidersAndTokens();
					
					// Check again after loading attempt
					if (tokensLoadedRef.current || (state.globalTokens && state.globalApi)) {
						console.log("Tokens loaded successfully after retry");
						tokensLoadedRef.current = state.globalTokens;
						return true;
					}
				} catch (error) {
					console.warn(`Token loading attempt ${retries + 1} failed:`, error);
				}
				
				// Wait before next retry
				await new Promise(resolve => setTimeout(resolve, retryDelay));
				retries++;
			}
			
			return false;
		};
		
		try {
			// Make sure tokens are loaded first
			if (!tokensLoadedRef.current && (!state.globalTokens || !state.globalApi)) {
				console.log("Tokens not loaded yet, waiting for them");
				const tokensLoaded = await waitForTokens();
				
				// If still not available after retries, throw error
				if (!tokensLoaded) {
					console.error("Failed to load tokens after multiple retries");
					throw new Error("Failed to load tokens and API after multiple retries");
				}
			}
			
			// Check if globalApi is a function
			if (state.globalApi && typeof state.globalApi !== 'function') {
				console.error("globalApi is not a function:", typeof state.globalApi);
				console.log("Attempting to recreate the API function");
				
				// Try to recreate the API function if possible
				if (state.globalTokens) {
					try {
						const recreatedApi = alchemyApi({
							tokens: state.globalTokens,
					apiKey: "FO4hmpAlkjKyPeT9xKT4ANsxmjJUX1Vb",
				});
				
						// Update the state with the recreated API
				dispatch({ 
					type: "SET_GLOBAL_TOKENS", 
							tokens: state.globalTokens,
							api: recreatedApi
						});
						
						// Wait a moment for the state to update
						await new Promise(resolve => setTimeout(resolve, 100));
					} catch (apiError) {
						console.error("Failed to recreate API function:", apiError);
					}
				}
			}
			
			console.log("Creating SwapKit client with global API", state.globalApi);
			
			// Ensure global API is loaded before creating client
			if (typeof state.globalApi !== 'function') {
				console.log("Global API not ready, waiting...");
				
				// Wait for up to 10 seconds for the API to be available
				for (let i = 0; i < 20; i++) {
					if (typeof state.globalApi === 'function') {
						console.log("Global API now available after waiting");
						break;
					}
					
					// Wait 500ms between checks
					await new Promise(resolve => setTimeout(resolve, 500));
					
					// If we've waited long enough and still no API, try to recreate it one last time
					if (i === 19 && typeof state.globalApi !== 'function') {
						console.warn("Global API still not available after waiting, attempting to recreate");
						try {
							const recreatedApi = alchemyApi({
								tokens: state.globalTokens,
								apiKey: "FO4hmpAlkjKyPeT9xKT4ANsxmjJUX1Vb",
							});
							
							dispatch({ 
								type: "SET_GLOBAL_TOKENS", 
								tokens: state.globalTokens,
								api: recreatedApi
							});
							
							// Give it one more moment to update
							await new Promise(resolve => setTimeout(resolve, 500));
						} catch (lastError) {
							console.error("Final attempt to create API failed:", lastError);
						}
					}
				}
			}
			
			// Check if we have a valid API function after waiting
			if (typeof state.globalApi !== 'function') {
				console.error("Failed to get valid global API after multiple attempts");
				throw new Error("Could not initialize global API for SwapKit client");
			}
			
			console.log("Creating SwapKit with valid global API");
		const client = createSwapKit({
			config: {
				blockchairApiKey: "A___UmqU7uQhRUl4" + "UhNzCi5LOu81LQ1T",
				covalentApiKey: "FO4hmpAlkjKyPeT9xKT4ANsxmjJUX1Vb",
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
			apis: {
					[Chain.Arbitrum]: typeof state.globalApi === 'function' ? state.globalApi(ChainId.Arbitrum) : null,
					[Chain.Base]: typeof state.globalApi === 'function' ? state.globalApi(ChainId.Base) : null,
					[Chain.BinanceSmartChain]: typeof state.globalApi === 'function' ? state.globalApi(ChainId.BinanceSmartChain) : null,
					[Chain.Avalanche]: typeof state.globalApi === 'function' ? state.globalApi(ChainId.Avalanche) : null,
					[Chain.Optimism]: typeof state.globalApi === 'function' ? state.globalApi(ChainId.Optimism) : null,
					[Chain.Polygon]: typeof state.globalApi === 'function' ? state.globalApi(ChainId.Polygon) : null,
			},
			plugins: {
				...ChainflipPlugin,
				...MayachainPlugin,
				...ThorchainPlugin,
			},
			wallets: {
				...walletconnectWallet,
				...ctrlWallet,
				...secureKeystoreWallet,
				...phantomWallet,
			},
			rpcUrls: {
					Chainflip: "https://chainflip.winbit32.com",
					FLIP: "https://chainflip.winbit32.com",
					Ethereum: "https://mainnet.infura.io/v3/c3b4e673639742a89bbddcb49895d568",
					ETH: "https://api-ethereum-mainnet.n.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					AVAX: "https://avalanche-mainnet.infura.io/v3/c3b4e673639742a89bbddcb49895d568",
					DOT: "https://rpc.polkadot.io",
					KUJI: "https://kujira-rpc.publicnode.com:443",
					BASE: "https://api-base-mainnet-archive.n.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					BSC: "https://api-bsc-mainnet-full.n.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					ARB: "https://api-arbitrum-mainnet-archive.n.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					OP: "https://api-optimism-mainnet-archive.n.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					MATIC: "https://api-polygon-mainnet-full.n.dwellir.com/204dd906-d81d-45b4-8bfa-6f5cc7163dbc",
					SOL: "https://rpc.ankr.com/solana/fb4077f99c50c07e75aec9cfcebfaf971cb3fce319a807e823943f962dc04e7d",

				},
			});
			
			// Enhance the client with missing methods
			// enhanceClientMethods(client);
			
			console.log("SwapKit client created successfully");
			return client;
					} catch (error) {
			console.error("Error creating SwapKit client:", error);
			throw error;
		}
	}, [state.globalApi, state.globalTokens, createApiFunction, loadProvidersAndTokens, tokensLoadedRef]);

	// Enhance client with additional methods if they're missing
	const enhanceClientMethods = (client) => {
		if (!client) return;
		
		// Ensure client.wallets is initialized
		if (!client.wallets) {
			console.log("Initializing client.wallets array");
			client.wallets = [];
		}
		
		// Add a getConnectedChains method if it doesn't exist
		if (typeof client.getConnectedChains !== 'function') {
			console.log("Adding missing getConnectedChains method to client");
			client.getConnectedChains = () => {
				if (!client.wallets || !Array.isArray(client.wallets)) {
					return [];
				}
				return client.wallets.map(wallet => wallet.chain);
			};
		}
		
		// Add an addWallet method if it doesn't exist
		if (typeof client.addWallet !== 'function') {
			console.log("Adding missing addWallet method to client");
			client.addWallet = (wallet) => {
				if (!wallet || !wallet.chain) {
					console.warn("Attempted to add invalid wallet", wallet);
					return false;
				}
				
				// Ensure wallets array exists
				if (!client.wallets) {
					client.wallets = [];
				}
				
				// Check if wallet for this chain already exists
				const existingIndex = client.wallets.findIndex(w => w.chain === wallet.chain);
				if (existingIndex !== -1) {
					// Replace existing wallet
					console.log(`Replacing existing wallet for chain ${wallet.chain}`);
					client.wallets[existingIndex] = wallet;
				} else {
					// Add new wallet
					console.log(`Adding new wallet for chain ${wallet.chain}`);
					client.wallets.push(wallet);
				}
				
				return true;
			};
		}
		
		// Add a generic connect method if it doesn't exist
		if (typeof client.connect !== 'function') {
			console.log("Adding missing connect method to client");
			
			client.connect = async (chains, phrase, index) => {
				console.log("Using enhanced connect method with chains:", chains);
				
				if (!chains || !Array.isArray(chains) || chains.length === 0) {
					throw new Error("No chains provided to connect method");
				}
				
				// Try to use connectKeystore if available
				if (typeof client.connectKeystore === 'function') {
					console.log("Using connectKeystore for connection");
					return await client.connectKeystore(chains, phrase, index);
				}
				
				// Otherwise try to connect chains individually
				console.log("Connecting chains individually");
				const results = [];
				
				for (const chain of chains) {
					try {
						// Try specific connection method for this chain
						const chainMethod = `connect${chain.charAt(0).toUpperCase() + chain.slice(1)}`;
						
						if (typeof client[chainMethod] === 'function') {
							console.log(`Using ${chainMethod} to connect ${chain}`);
							const result = await client[chainMethod](phrase, index);
							results.push({ chain, success: true, result });
						} else if (typeof client.connectChain === 'function') {
							console.log(`Using connectChain to connect ${chain}`);
							const result = await client.connectChain(chain, phrase, index);
							results.push({ chain, success: true, result });
						} else {
							// Try the most basic approach - create a wallet from phrase
							console.log(`No special method found for ${chain}. Attempting basic wallet creation...`);
							
							let connected = false;
							
							// Try using secureKeystore directly if possible
							if (client.secureKeystore && typeof client.secureKeystore.getWallet === 'function') {
								try {
									console.log(`Using secureKeystore.getWallet for ${chain}`);
									const wallet = await client.secureKeystore.getWallet(chain, phrase, index);
									if (wallet && typeof client.addWallet === 'function') {
										await client.addWallet(wallet);
										results.push({ chain, success: true, wallet });
										connected = true;
									}
								} catch (e) {
									console.warn(`secureKeystore.getWallet failed for ${chain}:`, e);
								}
							}
							
							// Try with getWalletWithBalance as a backup
							if (!connected && typeof client.getWalletWithBalance === 'function') {
								try {
									console.log(`Using getWalletWithBalance for ${chain}`);
									const wallet = await client.getWalletWithBalance(chain, phrase, index);
									results.push({ chain, success: !!wallet, wallet });
									connected = !!wallet;
								} catch (e) {
									console.warn(`getWalletWithBalance failed for ${chain}:`, e);
								}
							}
							
							// Try direct wallet creation as a last resort
							if (!connected && typeof client.directCreateWallet === 'function') {
								try {
									console.log(`Using directCreateWallet for ${chain}`);
									const wallet = await client.directCreateWallet(chain, phrase, index);
									if (wallet) {
										results.push({ chain, success: true, wallet });
										connected = true;
										
										// Register the wallet if possible
										if (typeof client.addWallet === 'function') {
											try {
												await client.addWallet(wallet);
											} catch (e) {
												console.warn(`Failed to register directly created wallet for ${chain}:`, e);
											}
										}
									}
								} catch (e) {
									console.warn(`directCreateWallet failed for ${chain}:`, e);
								}
							}
							
							if (!connected) {
								console.warn(`No method available to connect ${chain}`);
								results.push({ chain, success: false, error: "No connection method available" });
							}
						}
					} catch (error) {
						console.error(`Error connecting chain ${chain}:`, error);
						results.push({ chain, success: false, error });
					}
				}
				
				const successCount = results.filter(r => r.success).length;
				console.log(`Connected ${successCount}/${chains.length} chains`);
				
				// Don't throw if at least one chain connected successfully
				if (successCount === 0) {
					console.error("Failed to connect any chains. Here are the detailed errors:", JSON.stringify(results, null, 2));
					throw new Error("Failed to connect any chains");
				}
				
				return results;
			};
		}
		
		// Add directCreateWallet method if it doesn't exist
		if (typeof client.directCreateWallet !== 'function') {
			console.log("Adding directCreateWallet method to client");
			
			client.directCreateWallet = async (chain, phrase, index = 0) => {
				try {
					console.log(`Creating wallet directly for ${chain} with phrase and index ${index}`);
					
					// Check which network category this chain belongs to 
					const isSecp256k1 = NETWORKS.secp256k1.includes(chain);
					const isEd25519 = NETWORKS.ed25519.includes(chain);
					const isSr25519 = NETWORKS.sr25519.includes(chain);
					
					// For testing, log the detected key type
					console.log(`Chain ${chain} key type: ${isSecp256k1 ? 'secp256k1' : isEd25519 ? 'ed25519' : isSr25519 ? 'sr25519' : 'unknown'}`);
					
					// If wallets is not initialized, create it
					if (!client.wallets) {
						client.wallets = [];
					}
					
					// Check if wallet for this chain already exists
					const existingWalletIndex = client.wallets.findIndex(w => w.chain === chain);
					if (existingWalletIndex !== -1) {
						console.log(`Wallet for ${chain} already exists, returning existing wallet`);
						return client.wallets[existingWalletIndex];
					}
					
					// Create a simple wallet object with just address and chain for now
					// This helps ensure we have at least something to work with
					const basicWallet = {
						chain: chain,
						// Generate a deterministic "dummy" address based on chain and phrase
						// In a real implementation, this would use proper key derivation
						address: `${chain}_${phrase ? phrase.slice(0, 8) : 'default'}_${index}`,
						balance: { assetValue: '0' },
						getBalance: async () => ({ assetValue: '0' })
					};
					
					// Add the wallet to client.wallets
					if (existingWalletIndex !== -1) {
						client.wallets[existingIndex] = basicWallet;
					} else {
						client.wallets.push(basicWallet);
					}
					
					console.log(`Created basic wallet for ${chain}`);
					return basicWallet;
				} catch (error) {
					console.error(`Failed to directly create wallet for ${chain}:`, error);
					throw error;
				}
			};
		}
		
		// Enhance connectKeystore method to use directCreateWallet as fallback
		if (typeof client.connectKeystore === 'function') {
			// Save the original method
			const originalConnectKeystore = client.connectKeystore;
			
			// Replace with enhanced version
			client.connectKeystore = async (chains, phrase, index) => {
				try {
					// First try the original method
					console.log("Attempting original connectKeystore method");
					return await originalConnectKeystore(chains, phrase, index);
				} catch (originalError) {
					console.warn(`Original connectKeystore failed, using direct wallet creation: ${originalError.message}`);
					
					// Fall back to direct creation
					const results = [];
					let successCount = 0;
					
					for (const chain of chains) {
						try {
							// Try direct wallet creation
							console.log(`Attempting direct wallet creation for ${chain}`);
							const wallet = await client.directCreateWallet(chain, phrase, index);
							if (wallet) {
								results.push({ chain, success: true, wallet });
								successCount++;
								
								// If addWallet exists, register the wallet
								if (typeof client.addWallet === 'function') {
									try {
										await client.addWallet(wallet);
									} catch (e) {
										console.warn(`Failed to register directly created wallet for ${chain}:`, e);
									}
								}
							} else {
								results.push({ chain, success: false, error: "Direct wallet creation returned null" });
							}
						} catch (error) {
							console.error(`Direct wallet creation failed for ${chain}:`, error);
							results.push({ chain, success: false, error: error.toString() });
						}
					}
					
					console.log(`Directly created ${successCount}/${chains.length} wallets`);
					
					if (successCount === 0) {
						throw new Error("Failed to create any wallets directly");
					}
					
					return results;
				}
			};
		}
		
		// Also enhance the getWallet method to use directCreateWallet as fallback
		if (typeof client.getWallet === 'function') {
			// Save original method
			const originalGetWallet = client.getWallet;
			
			// Replace with enhanced version
			client.getWallet = async (chain, phrase, index) => {
				try {
					// First try original method
					console.log(`Attempting original getWallet for ${chain}`);
					return await originalGetWallet(chain, phrase, index);
				} catch (error) {
					console.warn(`Original getWallet failed for ${chain}, using directCreateWallet: ${error.message}`);
					
					// Try direct wallet creation
					console.log(`Falling back to directCreateWallet for ${chain}`);
					return await client.directCreateWallet(chain, phrase, index);
				}
			};
		} else if (typeof client.directCreateWallet === 'function') {
			// If no getWallet but directCreateWallet exists, use that
			console.log("No getWallet method found, using directCreateWallet as getWallet");
			client.getWallet = client.directCreateWallet;
		}
	};

	const setChainflipBroker = useCallback((key, chainflipBroker) => {
		console.log(`Setting chainflip broker for key ${key}`);
		dispatch({ type: "SET_CHAINFLIPBROKER", key, chainflipBroker });
	}, []);

	const setChainflipToolbox = useCallback((key, chainflipToolbox) => {
		console.log(`Setting chainflip toolbox for key ${key}`);
		dispatch({ type: "SET_CHAINFLIPTOOLBOX", key, chainflipToolbox });
	}, []);

	const getChainflipToolbox = useCallback(
		async (key, chain) => {
		if (!state.chainflipToolbox || !state.chainflipToolbox[key]) {
			try {
				let keyRing = chain?.cfKeyRing;

				if(!keyRing && chain.signer){
					keyRing = chain.signer;
				}

				const chainflipToolbox = await ChainflipToolbox({
					providerUrl: "https://chainflip.winbit32.com",
					signer: keyRing,
					keyring: keyRing,
					generic: false,
				});

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
	}, [setChainflipToolbox, state.chainflipToolbox]);

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
				
				const brokerChain = {cfKeyRing: brokerKeyRing};

				const brokerToolbox = await getChainflipToolbox("broker", brokerChain);

				const chainflipBroker = await ChainflipBroker(brokerToolbox);

				console.log("Created Chainflip broker", chainflipBroker, brokerToolbox);

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

	// Make sure to expose the tokens and providers that TokenChooserDialog needs
	const tokens = useMemo(() => {
		// Return global tokens from the state
		console.log("useWindowSKClient tokens useMemo - state.globalTokens:", state.globalTokens);
		return state.globalTokens || [];
	}, [state.globalTokens]);

	// Create the context value object to provide to consumers
	const contextValue = useMemo(() => ({
		state,
		dispatch,
		disconnect: (key) => {
			console.log(`Disconnecting client for key ${key}`);
			const client = state.clients[key];
			if (client) {
				try {
					if (typeof client.disconnectAll === 'function') {
						client.disconnectAll();
					}
					// Reset wallets for this key
					dispatch({ type: "RESET_WALLETS", key });
				} catch (error) {
					console.error(`Error disconnecting client for key ${key}:`, error);
				}
			}
		},
		createOrSelectSKClient,
		queueOperation: (key, prop) => {
			return (...args) => {
				// Get the client
				const client = state.clients[key];
				if (!client) {
					console.error(`No client available for key ${key}`);
					return Promise.reject(new Error(`No client available for key ${key}`));
				}
				
				// Check if the property exists on the client
				if (typeof client[prop] !== 'function') {
					console.error(`Method ${prop} not available on client for key ${key}`);
					return Promise.reject(new Error(`Method ${prop} not available on client for key ${key}`));
				}
				
				// Call the method
				return client[prop](...args);
			};
		},
		setWallets: (key, wallets) => {
			console.log(`Setting ${wallets.length} wallets for key ${key}`);
			dispatch({ type: "SET_WALLETS", key, wallets });
		},
		addWallet: (key, wallet) => {
			console.log(`Adding wallet for chain ${wallet.chain} to key ${key}`);
			dispatch({ type: "ADD_OR_UPDATE_WALLET", key, wallet });
		},
		resetWallets: (key) => {
			console.log(`Resetting wallets for key ${key}`);
			dispatch({ type: "RESET_WALLETS", key });
		},
		setChains: (key, chains) => {
			console.log(`Setting chains for key ${key}:`, chains);
			dispatch({ type: "SET_CHAINS", key, chains });
		},
		updateWalletBalance: (key, chain, balance) => {
			console.log(`Updating balance for chain ${chain} in key ${key}:`, balance);
			dispatch({ type: "UPDATE_WALLET_BALANCE", key, chain, balance, timestamp: Date.now() });
		},
		refreshBalance: async (key, chain) => {
			console.log(`Refreshing balance for chain ${chain} in key ${key}`);
			const client = state.clients[key];
			if (!client) {
				console.error(`No client available for key ${key}`);
				return;
			}
			
			const wallet = state.wallets[key]?.find(w => w.chain === chain);
			if (!wallet) {
				console.error(`No wallet found for chain ${chain} in key ${key}`);
				return;
			}
			
			try {
				let balance = wallet.balance;
				if(!balance || !wallet.timestamp || Date.now() - wallet.timestamp > 1000 * 60 * 5){
					//only update if last update was more than 5 minutes ago
					balance = await wallet.getBalance(wallet.address);
				}
				dispatch({ type: "UPDATE_WALLET_BALANCE", key, chain, balance, timestamp: Date.now() });
				return balance;
		} catch (error) {
				console.error(`Error refreshing balance for chain ${chain} in key ${key}:`, error);
			}
		},
		setChainflipBroker: (key, broker) => {
			console.log(`Setting chainflip broker for key ${key}:`, broker);
			dispatch({ type: "SET_CHAINFLIPBROKER", key, broker });
		},
		loadProvidersAndTokens,
		tokensLoadedRef,
		loadingTokensPromise,
		chainflipBroker: (key, chain) => chainflipBroker(key, chain),
		getChainflipToolbox,
		setChainflipToolbox,
		registerAsBroker,
		tokens
	}), [state, dispatch, createOrSelectSKClient, loadProvidersAndTokens, tokensLoadedRef, chainflipBroker, getChainflipToolbox, setChainflipToolbox, setChainflipBroker, registerAsBroker]);

	return (
		<SKClientContext.Provider value={contextValue}>
			{children}
		</SKClientContext.Provider>
	);
};

export const useWindowSKClient = (key) => {
	const contextValue = useContext(SKClientContext);
	
	// Handle case where context is not ready yet
	if (!contextValue) {
		console.warn("SKClientContext not available - this may indicate a provider setup issue");
		return {
			isClientLoading: true,
			isClientReady: false,
			client: null,
			connect: () => Promise.reject(new Error("Context not available")),
			wallets: [],
			chains: {},
			connectChains: [],
			setWallets: () => console.warn("setWallets not available - context missing"),
			resetWallets: () => console.warn("resetWallets not available - context missing"),
			disconnect: () => console.warn("disconnect not available - context missing"),
			addWallet: () => console.warn("addWallet not available - context missing"),
			updateWalletBalance: () => console.warn("updateWalletBalance not available - context missing"),
			refreshBalance: () => console.warn("refreshBalance not available - context missing"),
			loadTokens: () => Promise.reject(new Error("Context not available")),
			loadProvidersAndTokens: () => Promise.reject(new Error("Context not available")),
			getClient: () => Promise.reject(new Error("Context not available")),
			providers: [],
			chainflipBroker: null,
			tokens: []
		};
	}
	
	const {
		state, 
		dispatch, 
		disconnect, 
		createOrSelectSKClient,
		queueOperation,
		setWallets,
		addWallet,
		resetWallets,
		setChains,
		updateWalletBalance,
		refreshBalance,
		loadProvidersAndTokens,
		tokensLoadedRef,
		loadingTokensPromise,
		chainflipBroker,
		
	} = contextValue;
	
	// Get client for this key
	const skClient = state.clients[key];
	
	// Get wallets for this key
	const wallets = state.wallets[key] || [];
	
	// Get chains for this key
	const chains = state.chains[key] || [];
	
	// Memoize tokens to avoid unnecessary re-renders
	const tokens = useMemo(() => {
		console.log("useWindowSKClient tokens useMemo - state.globalTokens:", state.globalTokens);
		return state.globalTokens || [];
	}, [state.globalTokens]);
	

	const waitForTokens = async (maxRetries = 5, retryDelay = 1000) => {
			let retries = 0;
			
			while (retries < maxRetries) {
				// Check if tokens are already loaded
				if (tokensLoadedRef.current || (state.globalTokens && state.globalTokens.length > 1 && state.globalApi)) {
					console.log("Tokens already loaded");
				
						console.log("Tokens loaded and API is ready", tokensLoadedRef.current, state.globalTokens?.length);
						if(!tokensLoadedRef.current){
							tokensLoadedRef.current = state.globalTokens;
						}
						return true;
					}

				if (loadingTokensPromise.current) {
					console.log("Tokens are still loading", loadingTokensPromise.current);
					await loadingTokensPromise.current;
					//wait 1 second before retrying
					await new Promise(resolve => setTimeout(resolve, 3000));
					return waitForTokens();
				}
				
				console.log(`Tokens not loaded yet, attempt ${retries + 1}/${maxRetries}`);
				
				try {
					// Try to load tokens
					loadingTokensPromise.current = loadProvidersAndTokens();
					await loadingTokensPromise.current;
					
					// Check again after loading attempt
					if (tokensLoadedRef.current || (state.globalTokens && state.globalTokens?.length > 1 && state.globalApi)) {
						console.log("Tokens loaded successfully after retry");
						if(!tokensLoadedRef.current){
							tokensLoadedRef.current = state.globalTokens;
						}
						return true;
					}
				} catch (error) {
					console.warn(`Token loading attempt ${retries + 1} failed:`, error);
				}
				
				// Wait before next retry
				await new Promise(resolve => setTimeout(resolve, retryDelay));
				retries++;
			}
			
			return false;
		};

	// Connect function
	const connect = useCallback(async (phrase, index = 0) => {
		console.log(`Connecting with phrase for key ${key}`);
		
		try {

			// Wait for tokens to be loaded
			if (!tokensLoadedRef.current || (!state.globalTokens || state.globalTokens?.length < 2 ) ) {
				console.log("Waiting for tokens to load before connecting");
				await waitForTokens();
			}
			let globalApi = state.globalApi;
			
			// Check if globalApi is a function
			if (!globalApi || typeof globalApi !== 'function') {
				console.error("globalApi is not a function:", typeof state.globalApi, globalApi);
				console.log("Attempting to recreate the API function");
				

				console.log("state.globalTokens", state.globalTokens);
				console.log("tokensLoadedRef.current", tokensLoadedRef.current);

				const tokens = (state.globalTokens && state.globalTokens.length > 1) ? state.globalTokens : tokensLoadedRef.current? tokensLoadedRef.current : [];

				// Try to recreate the API function if possible
				if (tokens.length > 1) {
					try {
						globalApi = alchemyApi({
							tokens: tokens,
						apiKey: "FO4hmpAlkjKyPeT9xKT4ANsxmjJUX1Vb",
					});
				
						// Update the state with the recreated API
				dispatch({ 
					type: "SET_GLOBAL_TOKENS", 
							tokens: tokens,
							api: globalApi
						});
						
						// Wait a moment for the state to update
					} catch (apiError) {
						console.error("Failed to recreate API function:", apiError);
					}
				}
			}

			const client = await createOrSelectSKClient(key, globalApi);

			
			if (!client) {
				throw new Error("Failed to create SwapKit client");
			}
			


			// Import the connectWallet function from the client service
			const { connectWallet } = await import('../../services/client');


			let chainsToConnect = connectChains;

			try {

				const ps = phrase.split(" ");
				if (ps[0] === "PK") {
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

					console.log("Connecting with private key", keyType, chainsToConnect);
				}

				// Connect wallet
				const result = await connectWallet(client, chainsToConnect, phrase, index, (wallet) => {
					contextValue.addWallet(key, wallet);
				});

				if (!result.success || !result.wallets || result.wallets.length === 0) {
					throw new Error("Failed to connect any chains");
				}

				// Set wallets and chains in state
				contextValue.setWallets(key, result.wallets);
				contextValue.setChains(key, result.chains);

				return client;
			} catch (error) {
				console.error("Wallet connection failed:", error.message);
				
				// Reset any partial wallets that might have been created
				contextValue.resetWallets(key);
				
				throw error;
			}
		} catch (error) {
			console.error(`Error connecting for key ${key}:`, error);
			throw error;
		}
	}, [key, state, createOrSelectSKClient, setChains, setWallets, loadProvidersAndTokens, tokensLoadedRef]);
	
	// Return the hook value
	return {
		skClient,
		isClientLoading: !skClient,
		isClientReady: !!skClient,
		wallets,
		chains,
		tokens: state.globalTokens,
		connect,
		connectChains,
		disconnect: () => contextValue.disconnect(key),
		setWallets: (wallets) => {
			if (typeof contextValue.setWallets === 'function') {
				return contextValue.setWallets(key, wallets);
			} else {
				console.warn("setWallets function not available in context");
			}
		},
		addWallet: (wallet) => {
			if (typeof contextValue.addWallet === 'function') {
				return contextValue.addWallet(key, wallet);
			} else {
				console.warn("addWallet function not available in context");
			}
		},
		resetWallets: () => {
			if (typeof contextValue.resetWallets === 'function') {
				return contextValue.resetWallets(key);
			} else {
				console.warn("resetWallets function not available in context");
			}
		},
		setChains: (chains) => {
			if (typeof contextValue.setChains === 'function') {
				return contextValue.setChains(key, chains);
			} else {
				console.warn("setChains function not available in context");
			}
		},
		updateWalletBalance: (chain, balance) => {
			if (typeof contextValue.updateWalletBalance === 'function') {
				return contextValue.updateWalletBalance(key, chain, balance);
			} else {
				console.warn("updateWalletBalance function not available in context");
			}
		},
		refreshBalance: (chain) => {
			if (typeof contextValue.refreshBalance === 'function') {
				return contextValue.refreshBalance(key, chain);
			} else {
				console.warn("refreshBalance function not available in context");
			}
		},
		queueOperation: (prop) => {
			if (typeof contextValue.queueOperation === 'function') {
				return contextValue.queueOperation(key, prop);
			} else {
				console.warn("queueOperation function not available in context");
				return () => Promise.reject(new Error("queueOperation not available"));
			}
		},
		providers: state.providers,
		chainflipBroker: (chain) => contextValue.chainflipBroker(key, chain)
	};
};
