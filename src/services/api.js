import { SwapKitApi } from "@doritokit/api";

/**
 * API Service
 * Handles token loading and API creation
 */
import { alchemyApi } from "../components/contexts/SKClientProviderManager";

/**
 * Creates an API instance for token pricing and data
 * @param {Object} options - API options
 * @param {string} options.apiKey - API key for authentication
 * @returns {Object|null} API instance or null if creation failed
 */
export const createApi = ({ apiKey }) => {
	try {
		console.log("Creating API with key:", apiKey);
		
		if (window.createApi) {
			console.log("Using window.createApi to create API");
			
			console.log("API created successfully:", api);
			return api;
		} else {
			console.error("window.createApi is not available");
			
			// Create a fallback API if window.createApi is not available
			console.log("Creating fallback API");
			return {
				getPrice: async () => ({ price: 0 }),
				getPrices: async () => ({}),
				getTokens: async () => ([]),
				getProviders: async () => ([]),
				isValid: true
			};
		}
	} catch (error) {
		console.error("Error creating API:", error);
		return null;
	}
};

/**
 * Loads tokens from the API
 * @param {Object} globalTokens - Existing tokens to check
 * @returns {Promise<Array>} Array of tokens
 */
export const loadTokens = async (globalTokens, dispatch) => {
	console.log("loadTokens called");
	
	// If tokens are already loaded, return them
	if (globalTokens && Array.isArray(globalTokens) && globalTokens.length > 1) {
		console.log("Returning existing tokens:", globalTokens.length);
		return globalTokens;
	}
	
	try {
		// Fetch tokens from API
		let baseUrl = "https://crunchy.dorito.club/api/";
		
		// First fetch providers
		let providerResponse;
		try {
			console.log("Fetching providers from:", baseUrl + "providers");
			providerResponse = await fetch(baseUrl + "providers");
			
			if (providerResponse.status !== 200) {
				// console.log("Switching to backup API endpoint");
				// baseUrl = "https://api.swapkit.dev/";
				throw new Error("Failed to fetch providers from primary endpoint");
				// providerResponse = await fetch(baseUrl + "providers");
			}
		} catch (error) {
			console.error("Failed to fetch providers from primary endpoint:", error);
			// baseUrl = "https://api.swapkit.dev/";
			throw new Error("Failed to fetch providers from primary endpoint");
			// providerResponse = await fetch(baseUrl + "providers");
		}
		
		const providersUnsorted = await providerResponse.json();
		const allProviders = providersUnsorted.sort((a, b) => {
			if (a.provider === "THORSWAP" || b.provider === "MAYA") return -1;
			if (b.provider === "THORSWAP" || a.provider === "MAYA") return 1;
			return a.provider < b.provider ? -1 : 1;
		});
		
		console.log("Providers loaded:", allProviders.length);
		dispatch({ type: "SET_PROVIDERS", providers: allProviders });
		
		// Now fetch tokens from each provider
		console.log("Fetching tokens for each provider...");
		const tokensResponse = await Promise.all(
			allProviders.map(async (provider) => {
				try {
					const tokenResponse = await fetch(
						baseUrl + `tokens?provider=${provider.provider}`
					);
					const tokenData = await tokenResponse.json();
					
					if (!tokenData.tokens) {
						console.warn(`No tokens found for provider: ${provider.provider}`);
						return [];
					}
					
					return tokenData.tokens
						.map(token => ({
							...token,
							logoURI: token.identifier?.includes("/") ? 
								token.logoURI.split("/").slice(0,-1).join("/") + "." + token.logoURI.split("/").pop() :
								token.logoURI,
							provider: provider.provider
						}))
						.filter(token => token.chain !== "BNB");
				} catch (error) {
					console.error(`Failed to fetch tokens for provider ${provider.provider}:`, error);
					return [];
				}
			})
		);
		
		const sortedTokens = tokensResponse.flat().sort((a, b) => {
			if (a.shortCode || b.shortCode) return a.shortCode ? -1 : 1;
			if (a.chain === a.ticker || b.chain === b.ticker) return a.chain === a.ticker ? -1 : 1;
			return a.chain < b.chain ? -1 : 1;
		});
		
		console.log("Tokens loaded successfully:", sortedTokens.length);
		return sortedTokens;
	} catch (error) {
		console.error("Error loading tokens:", error);
		return [];
	}
};

/**
 * Loads providers and tokens and creates API if needed
 * @param {Object} state - Current state with globalTokens and globalApi
 * @param {Function} dispatch - Dispatch function to update state
 * @param {Object} tokensLoadedRef - Ref to track if tokens are loaded
 * @returns {Promise<Array>} Array of tokens
 */
export const loadProvidersAndTokens = async (state, dispatch, tokensLoadedRef) => {
	console.log("loadProvidersAndTokens called");
	
	// If tokens are already loaded, return
	if (tokensLoadedRef.current === true && 
		state.globalTokens && 
		state.globalTokens.length > 1 &&
		Array.isArray(state.globalTokens) && 
		state.globalTokens.length > 1) {
		console.log("Tokens already loaded:", state.globalTokens.length);
		return state.globalTokens;
	}
	
	try {

		
		// Load tokens
		console.log("Loading tokens using loadTokens");
		const tokens = await loadTokens(state.globalTokens, dispatch);
		
		if (tokens && Array.isArray(tokens) && tokens.length > 1) {
			console.log("Tokens loaded successfully:", tokens.length);
			


			console.log("Creating global API");
			const api = alchemyApi({
				tokens,
				apiKey: "FO4hmpAlkjKyPeT9xKT4ANsxmjJUX1Vb",

			});
			

			// Update state with tokens and API
			dispatch({ 
				type: "SET_GLOBAL_TOKENS", 
				tokens,
				api: api
			});
			
			// Set the tokens loaded flag
			if (tokensLoadedRef) {
				tokensLoadedRef.current = tokens;
			}
			
			return tokens;
		} else {
			console.error("Tokens load failed - returned invalid data:", tokens);
			return [];
		}
	} catch (error) {
		console.error("Token loading error:", error);
		return [];
	}
};

/**
 * Waits for tokens to be loaded
 * @param {Object} state - Current state
 * @param {Function} loadTokensFunc - Function to load tokens
 * @param {Object} tokensLoadedRef - Ref to track if tokens are loaded
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<void>}
 */
export const waitForTokens = async (state, loadTokensFunc, tokensLoadedRef, maxRetries = 20) => {
	console.log("Waiting for tokens to load...");

	// If tokens are already loaded and valid, return immediately
	if (tokensLoadedRef.current &&
		state.globalTokens && 
		Array.isArray(state.globalTokens) && 
		state.globalTokens.length > 1) {
		console.log(`Tokens already loaded: ${state.globalTokens.length} tokens available`);
		return;
	}

	// If tokens aren't loaded yet, try to load them
	if (loadTokensFunc && typeof loadTokensFunc === 'function') {
		try {
			console.log("Attempting to load tokens...");
			const tokens = await loadTokensFunc();
			
			// If tokens were loaded successfully, return immediately
			if (tokens && Array.isArray(tokens) && tokens.length > 0) {
				console.log(`Tokens loaded successfully: ${tokens.length} tokens available`);
				tokensLoadedRef.current = tokens;
				return;
			}
		} catch (error) {
			console.warn("Failed initial attempt to load tokens:", error);
		}
	}

	// Wait for tokens to be loaded
	for (let i = 0; i < maxRetries; i++) {
		// Check if tokens are loaded and valid
		if (tokensLoadedRef.current &&
			(state.globalTokens && Array.isArray(state.globalTokens) && state.globalTokens.length > 1)) {
			
			// If tokens exist but flag isn't set, set it now
			if (!tokensLoadedRef.current && state.globalTokens && state.globalTokens.length > 1) {
				console.log(`Setting tokensLoadedRef to true for ${state.globalTokens.length} tokens`);
				tokensLoadedRef.current = state.globalTokens;
			}
			
			console.log(`Tokens loaded successfully after ${i} retries: ${state.globalTokens?.length || 0} tokens available`);
			return;
		}

		// After a few retries, try loading them again
		if (i % 3 === 2 && loadTokensFunc && typeof loadTokensFunc === 'function') {
			try {
				console.log(`Retry ${i+1}/${maxRetries}: Attempting to load tokens again...`);
				const tokens = await loadTokensFunc();
				
				// If tokens were loaded successfully, return immediately
				if (tokens && Array.isArray(tokens) && tokens.length > 0) {
					console.log(`Tokens loaded successfully on retry ${i+1}: ${tokens.length} tokens available`);
					tokensLoadedRef.current = tokens;
					return;
				}
			} catch (error) {
				console.warn(`Retry ${i+1}/${maxRetries}: Failed to load tokens:`, error);
			}
		}

		// Check if global API is available
		if (state.globalApi) {
			console.log("Global API is available, checking tokens...");

			if (state.globalTokens && Array.isArray(state.globalTokens) && state.globalTokens.length > 0) {
				console.log(`Global tokens available: ${state.globalTokens.length} tokens`);
				// If API is available and tokens exist but not marked as loaded, mark them as loaded
				if (!tokensLoadedRef.current) {
					console.log("Global API and tokens available but not marked as loaded. Marking as loaded.");
					tokensLoadedRef.current = state.globalTokens;
				}
				return;
			}
		}

		// Wait before checking again
		await new Promise(resolve => setTimeout(resolve, 500));
	}

	// If we get here, tokens failed to load after all retries
	console.warn("Warning: Tokens failed to load after maximum retries");

	// If globalApi is available, we can continue despite tokens not being fully loaded
	if (state.globalApi) {
		console.log("Global API is available despite token loading issues. Proceeding anyway.");
		return;
	}

	throw new Error("Failed to load tokens after multiple attempts");
}; 