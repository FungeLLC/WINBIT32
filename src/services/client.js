/**
 * Client Service
 * Handles SwapKit client creation and management
 */

// Import createSwapKit from the SDK
import { createSwapKit, Chain, ChainId } from "@doritokit/sdk";
import { walletconnectWallet } from "@doritokit/wallet-wc";
import { secureKeystoreWallet } from '../components/wallets/secureKeystore/index.ts';
import { ctrlWallet, CTRL_SUPPORTED_CHAINS } from "../components/wallets/wallet-ctrl/index.ts";
import { phantomWallet, PHANTOM_SUPPORTED_CHAINS } from "../components/wallets/wallet-phantom/index.ts";
import { ChainflipPlugin } from "../components/plugins/chainflip/plugin.ts";
import { ThorchainPlugin, MayachainPlugin } from "@doritokit/plugin-thorchain";
import { JupiterPlugin } from "../components/plugins/jupiter.ts";
import { EVMPlugin } from "@doritokit/plugin-evm";

/**
 * Creates or selects a SwapKit client
 * @param {string} key - Client key
 * @param {Object} api - API instance
 * @returns {Promise<Object>} SwapKit client instance
 */
export const createSwapKitClient = async (key, api) => {
	console.log(`Creating SwapKit client for ${key} with API:`, api ? "Available" : "Not available");
	
	try {
		// Create the client directly using createSwapKit instead of window.createSwapKitClient
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
				[Chain.Arbitrum]: api(ChainId.Arbitrum),
				[Chain.Base]: api(ChainId.Base),
				[Chain.BinanceSmartChain]: api(ChainId.BinanceSmartChain),
				[Chain.Avalanche]:  api(ChainId.Avalanche) ,
				[Chain.Optimism]: api(ChainId.Optimism),
				[Chain.Polygon]:  api(ChainId.Polygon),
			},
			plugins: {
				...ChainflipPlugin,
				...MayachainPlugin,
				...ThorchainPlugin,
				...JupiterPlugin,
				...EVMPlugin,
			},
			wallets: {
				...walletconnectWallet,
				...ctrlWallet,
				...secureKeystoreWallet,
				...phantomWallet,
			},
			rpcUrls: {
				Chainflip: "wss://mainnet-archive.chainflip.io",
				FLIP: "wss://mainnet-archive.chainflip.io",
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
		
		// Store the client in the window for debugging
		if (typeof window !== 'undefined') {
			window.swapKitClient = client;
		}
		
		console.log(`SwapKit client created successfully for ${key}`);
		
		// Initialize wallet array if not already present
		if (!client.wallets || !Array.isArray(client.wallets)) {
			console.log("Initializing empty wallets array for client");
			client.wallets = [];
		}
		
		// Make sure client has getConnectedChains method
		if (!client.getConnectedChains) {
			console.log("Adding getConnectedChains method to client");
			client.getConnectedChains = () => {
				if (!client.wallets || !Array.isArray(client.wallets)) {
					return [];
				}
				return [...new Set(client.wallets.map(wallet => wallet.chain))];
			};
		}
		
		// Ensure client has API
		if (!client.api && api) {
			console.log("Adding API to client");
			client.api = api;
		}
		
		return client;
	} catch (error) {
		console.error(`Error creating SwapKit client for ${key}:`, error);
		throw error;
	}
};

/**
 * Gets or creates a client
 * @param {string} key - Client key
 * @param {Object} state - Current state
 * @param {Function} createClientFunc - Function to create a client
 * @returns {Promise<Object>} Client instance
 */
export const getOrCreateClient = async (key, state, createClientFunc) => {
	console.log(`Getting or creating SwapKit client for ${key}`);
	
	// Check if client already exists
	if (state.clients[key]) {
		console.log(`Client already exists for ${key}`);
		return state.clients[key];
	}
	
	// Try to create client with multiple attempts
	const maxAttempts = 3;
	let lastError = null;
	
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			console.log(`Creating new client for ${key} (attempt ${attempt}/${maxAttempts})`);
			
			// Check if global API is available
			if (!state.globalApi) {
				console.warn(`Global API not available before client creation (attempt ${attempt})`);
				
				// On the last attempt, create a client without the API
				if (attempt === maxAttempts) {
					console.log("Last attempt: Creating client without API");
					const client = await createClientFunc(key, null);
					
					// Add fallback API methods to the client
					client.api = {
						getPrice: async () => ({ price: 0 }),
						getPrices: async () => ({}),
						getTokens: async () => ([]),
						getProviders: async () => ([]),
						isValid: true
					};
					
					return client;
				}
			} else {
				console.log(`Using global API for client creation (attempt ${attempt})`);
				const client = await createClientFunc(key, state.globalApi);
				return client;
			}
		} catch (error) {
			console.error(`Failed to create client (attempt ${attempt}):`, error);
			lastError = error;
			
			// If not the last attempt, wait before retrying
			if (attempt < maxAttempts) {
				const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
				console.log(`Retrying client creation in ${delay/1000} seconds...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	
	// If we get here, all attempts failed
	throw new Error(`Client creation failed after ${maxAttempts} attempts: ${lastError?.message || "Unknown error"}`);
};

const connectWalletChain = async (clientInstance, chain, phrase, index) => {
	
	await clientInstance.connectSecureKeystore([chain], phrase, index);
		
			console.log(`Connected chains`, clientInstance);

			// Get wallets for each chain
				try {
					// Use getWalletWithBalance to get the wallet for this chain
					const wallet = await clientInstance.getWalletWithBalance(chain);
					
					if (wallet && wallet.chain && wallet.address) {
						console.log(`Got wallet for chain ${chain}:`, wallet.address);
						return wallet;
						
					} else {
						console.warn(`No valid wallet returned for chain ${chain}`);
					}
				} catch (walletError) {
					console.warn(`Error getting wallet for chain ${chain}:`, walletError.message);
					//connectionErrors.push(`${chain}: ${walletError.message}`);
				}
			
				return null;

		}
	



/**
 * Connects a wallet to the client
 * @param {Object} clientInstance - Client instance
 * @param {Array} connectChains - Chains to connect
 * @param {string} phrase - Mnemonic phrase
 * @param {number} index - Account index
 * @returns {Promise<Object>} Connection result with wallets and chains
 */
export const connectWallet = async (clientInstance, connectChains, phrase, index, addWallet = () => {}) => {
	console.log("Connecting wallet with client instance:", clientInstance ? "Available" : "Not available");
	console.log("Connecting chains:", connectChains);
	
	let connected = false;
	let wallets = [];
	const connectionErrors = [];
	
	if (!clientInstance) {
		throw new Error("Invalid client instance");
	}
	
	// Check for special wallet types based on first word of phrase
	const pSplit = phrase.toUpperCase().trim().split(" ");
	const firstWord = pSplit[0] || '';

	// Handle WalletConnect
	if (firstWord === "WALLETCONNECT") {
		console.log("Connecting with WalletConnect");
		try {
			// Hide root element during WalletConnect modal
			if (typeof document !== 'undefined' && document.getElementById("root")) {
				document.getElementById("root").style.display = "none";
			}
			
			// Set up WalletConnect metadata
			const metadata = {
				name: "WINBIT32",
				description: "WINBIT32 does stuff.",
				url: "https://winbit32.com/",
				icons: ["https://winbit32.com/favicon/android-icon-192x192.png"],
			};
			
			// Specify supported chains for WalletConnect
			const wcChains = [
				Chain.BinanceSmartChain,
				Chain.Ethereum,
				Chain.Avalanche,
				Chain.Arbitrum,
			];
			
			// Connect using WalletConnect
			const result = await clientInstance.connectWalletconnect(wcChains, { metadata });
			
			if (result) {
				// Get wallets for each chain
				for (const chain of wcChains) {
					try {
						const wallet = await clientInstance.getWalletWithBalance(chain);
						if (wallet && wallet.chain && wallet.address) {
							console.log(`Got wallet for chain ${chain}:`, wallet.address);
							wallets.push(wallet);
							addWallet(wallet);
						}
					} catch (error) {
						console.warn(`Error getting wallet for chain ${chain}:`, error.message);
						connectionErrors.push(`${chain}: ${error.message}`);
					}
				}
			}
			
			// Show root element again
			if (typeof document !== 'undefined' && document.getElementById("root")) {
				document.getElementById("root").style.display = "block";
			}
			
			if (wallets.length > 0) {
				return {
					success: true,
					wallets,
					chains: wallets.map(w => w.chain)
				};
			} else {
				throw new Error("No wallets connected with WalletConnect");
			}
		} catch (error) {
			console.error("WalletConnect connection error:", error);
			
			// Show root element again in case of error
			if (typeof document !== 'undefined' && document.getElementById("root")) {
				document.getElementById("root").style.display = "block";
			}
			
			throw new Error(`WalletConnect connection failed: ${error.message}`);
		}
	}
	
	// Handle CTRL wallet
	else if (firstWord === "CTRL") {
		console.log("Connecting with CTRL wallet");
		try {
			// Check if CTRL provider is available
			if (typeof window !== 'undefined' && !window.ctrlEthProviders) {
				window.open("https://ctrl.xyz/", "_blank");
				throw new Error("CTRL wallet not installed. Please install CTRL wallet and try again.");
			}
			
			
			// Connect to CTRL wallet with supported chains
			const result = await clientInstance.connectCTRL(CTRL_SUPPORTED_CHAINS);
			
			const walletPromises = [];

			if (result) {
				// Get wallets for each chain
				for (const chain of CTRL_SUPPORTED_CHAINS) {
					walletPromises.push(clientInstance.getWalletWithBalance(chain)
						.then(wallet => {
							if (wallet && wallet.chain && wallet.address) {
								console.log(`Got wallet for chain ${chain}:`, wallet.address);
								wallets.push(wallet);
								addWallet(wallet);
							}
						})
						.catch(error => {
							console.warn(`Error getting wallet for chain ${chain}:`, error.message);
							connectionErrors.push(`${chain}: ${error.message}`);
						})
					);
				}
			}
			
			await Promise.all(walletPromises);

			if (wallets.length > 0) {
				return {
					success: true,
					wallets,
					chains: wallets.map(w => w.chain)
				};
			} else {
				throw new Error("No wallets connected with CTRL");
			}
		} catch (error) {
			console.error("CTRL wallet connection error:", error);
			throw new Error(`CTRL wallet connection failed: ${error.message}`);
		}
	}
	
	// Handle Phantom wallet
	else if (firstWord === "PHANTOM") {
		console.log("Connecting with Phantom wallet");
		try {
			// Connect to Phantom wallet with supported chains
			const result = await clientInstance.connectPhantom(PHANTOM_SUPPORTED_CHAINS);
			
			if (result) {
				// Get wallets for each chain
				for (const chain of PHANTOM_SUPPORTED_CHAINS) {
					try {
						const wallet = await clientInstance.getWalletWithBalance(chain);
						if (wallet && wallet.chain && wallet.address) {
							console.log(`Got wallet for chain ${chain}:`, wallet.address);
							wallets.push(wallet);
							addWallet(wallet);
						}
					} catch (error) {
						console.warn(`Error getting wallet for chain ${chain}:`, error.message);
						connectionErrors.push(`${chain}: ${error.message}`);
					}
				}
			}
			
			if (wallets.length > 0) {
				return {
					success: true,
					wallets,
					chains: wallets.map(w => w.chain)
				};
			} else {
				throw new Error("No wallets connected with Phantom");
			}
		} catch (error) {
			console.error("Phantom wallet connection error:", error);
			throw new Error(`Phantom wallet connection failed: ${error.message}`);
		}
	}
	
	// Handle SecureKeystore wallet
	else if (firstWord === "SECUREKEYSTORE") {
		console.log("Connecting with SecureKeystore");
		try {
			// Prompt for password and options
			const { password, dIndex, networkOptions } = await clientInstance.promptForPassword();
			
			if (!password) {
				throw new Error("Password required for SecureKeystore");
			}
			
			const connectPromises = [];

			// Connect to each chain with SecureKeystore
			for (const chain of connectChains) {
				connectPromises.push(clientInstance.connectSecureKeystore([chain], password, dIndex || index, {
					networkOptions,
				}).then(
					async () => {
						const wallet = await clientInstance.getWalletWithBalance(chain);
						if (wallet && wallet.chain && wallet.address) {
							console.log(`Got wallet for chain ${chain}:`, wallet.address);
							wallets.push(wallet);
							addWallet(wallet);
						}
					}
				).catch(error => {
					console.warn(`Error connecting to chain ${chain}:`, error.message);
					connectionErrors.push(`${chain}: ${error.message}`);
				}));
			}

			await Promise.all(connectPromises);

			if (wallets.length > 0) {
				return {
					success: true,
					wallets,
					chains: wallets.map(w => w.chain)
				};
			} else {
				throw new Error("No wallets connected with SecureKeystore");
			}
		} catch (error) {
			console.error("SecureKeystore connection error:", error);
			throw new Error(`SecureKeystore connection failed: ${error.message}`);
		}
	}
	
	// Try different connection methods in sequence for regular phrases
	try {
		// Try connecting chains with secureKeystore
		console.log("Trying to connect chains with secureKeystore");
		const connectedChains = [];
		const connectPromises = [];
		
		try {
			console.log(`Connecting chains`, connectChains);
			for (const chain of connectChains) {
				connectPromises.push(connectWalletChain(clientInstance, chain, phrase, index)
					.then(
						wallet => {
							if (wallet) {
								connectedChains.push(chain);
								wallets.push(wallet);
								addWallet(wallet);
							}
						}
					).catch(error => {
						console.error("Error connecting wallet:", error);
						connectionErrors.push(`${chain}: ${error.message}`);
					}));
			}
			await Promise.all(connectPromises);
			connected = wallets.length > 0;
		} catch (error) {
			console.error("Error connecting wallets:", error);
			throw new Error(`Wallet connection failed: ${error.message}`);
		}
		
		if (connected) {
			console.log(`Connected ${connectedChains.length} chains with ${wallets.length} wallets`);
			return { 
				success: true, 
				wallets,
				chains: connectedChains
			};
		}
		
		// If all methods failed, throw an error with details
		const errorDetails = connectionErrors.length > 0 
			? `: ${connectionErrors.join('; ')}` 
			: '';
		throw new Error(`Failed to connect any chains${errorDetails}`);
	} catch (error) {
		console.error("All connection methods failed:", error);
		
		// Throw a descriptive error that will be handled by the UI
		throw new Error(`Wallet connection failed: ${error.message}`);
	}
}; 