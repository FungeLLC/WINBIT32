import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import DialogBox from "../../win/DialogBox";
import { useWindowSKClient } from "../../contexts/SKClientProviderManager";
import './styles/TokenChooserDialog.css';
import { chainImages, fetchCategories, fetchTokensByCategory } from "./includes/tokenUtils";
import { debounce } from "lodash";

const TokenChooserDialog = ({ isOpen, onClose, onConfirm, providerKey, wallets, otherToken, windowId, inputRef }) => {
	const { providers: unfilteredProviders = [], tokens: unfilteredTokens = [], providerNames = {}, loadProvidersAndTokens, loadTokens } = useWindowSKClient(providerKey);
	
	// Add loading state to show loading indicator
	const [tokenLoadingStatus, setTokenLoadingStatus] = useState('idle'); // 'idle', 'loading', 'loaded', 'error'
	
	// Add debug logging
	useEffect(() => {
		console.log("TokenChooserDialog received tokens:", unfilteredTokens);
		console.log("TokenChooserDialog received providers:", unfilteredProviders);
		
		// Update token loading status based on tokens availability
		if (unfilteredTokens && unfilteredTokens.length > 0) {
			setTokenLoadingStatus('loaded');
		}
	}, [unfilteredTokens, unfilteredProviders]);
	
	// Add explicit token loading when component mounts
	useEffect(() => {
		if (isOpen && (!unfilteredTokens || unfilteredTokens.length === 0)) {
			console.log("TokenChooserDialog: No tokens found, loading tokens...");
			setTokenLoadingStatus('loading');
			
			if (loadProvidersAndTokens && typeof loadProvidersAndTokens === 'function') {
				loadProvidersAndTokens()
					.then(() => {
						console.log("TokenChooserDialog: Tokens loaded successfully");
						setTokenLoadingStatus('loaded');
					})
					.catch(error => {
						console.error("TokenChooserDialog: Failed to load tokens:", error);
						setTokenLoadingStatus('error');
					});
			} else if (loadTokens && typeof loadTokens === 'function') {
				loadTokens()
					.then((tokens) => {
						console.log("TokenChooserDialog: Tokens loaded successfully:", tokens?.length || 0);
						setTokenLoadingStatus('loaded');
					})
					.catch(error => {
						console.error("TokenChooserDialog: Failed to load tokens:", error);
						setTokenLoadingStatus('error');
					});
			} else {
				console.error("TokenChooserDialog: No token loading function available");
				setTokenLoadingStatus('error');
			}
		}
	}, [isOpen, unfilteredTokens, loadProvidersAndTokens, loadTokens]);
	
	const [selectedChain, setSelectedChain] = useState("");
	const [selectedProvider, setSelectedProvider] = useState("");
	const [selectedToken, setSelectedToken] = useState(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [userInteracted, setUserInteracted] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState("");
	const [categories, setCategories] = useState([]);
	const [tokensByCategory, setTokensByCategory] = useState({});
	const [restrictToProviders, setRestrictToProviders] = useState(null);
	const [searchTextActive, setSearchTextActive] = useState(false);
	const [providers, setProviders] = useState([]);
	const tokens = useMemo(() => {
		console.log("Filtering tokens from:", unfilteredTokens);
		if (!unfilteredTokens || unfilteredTokens.length === 0) {
			return [];
		}
		return unfilteredTokens.filter(token => 
			(token && token.provider && (token.provider.includes("THOR") || token.provider.includes("MAYA") || token.provider.includes("CHAINFLIP")))
			&&
			(token && token.identifier && token.identifier.includes("/") === false)
		);
	}, [unfilteredTokens]);

	useEffect(() => {
		console.log("Filtered tokens result:", tokens);
	}, [tokens]);

	const observer = useRef(new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				const img = entry.target;
				const src = img.getAttribute('data-src');
				img.src = src;
				observer.current.unobserve(img);
			}
		});
	}, { rootMargin: '200px' }));

	useEffect(() => {
		// Filter providers safely - with added defensive coding
		if (unfilteredProviders && Array.isArray(unfilteredProviders)) {
			const filteredProviders = unfilteredProviders.filter((provider) => {
				return provider && provider.provider && 
					(provider.provider.includes("THOR") || 
					provider.provider.includes("MAYA") || 
					provider.provider.includes("CHAINFLIP"));
			});
			setProviders(filteredProviders);
		} else {
			setProviders([]);
		}
	}, [unfilteredProviders]);


	useEffect(() => {
		return () => observer.current.disconnect();
	}, []);

	useEffect(() => {
		console.log("TokenChooserDialog isOpen", isOpen, wallets);
		if((isOpen === 'from' || isOpen == 'send') && wallets && wallets.length > 0){
			setSelectedCategory('wallet');
			// handleCategoryChange({ target: { value: 'wallet' } });
		}
		
		// if(isOpen === 'to' && otherToken){

		// 	console.log("otherToken", otherToken);
		// 	//cycle through tokens and get providers for otherToken

		// 	const otherProviders = tokens.reduce((acc, token) => {
		// 		if(otherToken.identifier.toUpperCase() === token.identifier.toUpperCase()){
		// 			acc.push(token.provider);
		// 		}
		// 		return acc;
		// 	}, []);


		// 	console.log("otherProviders", otherProviders);

		// 	if(otherProviders.length > 0){
		// 		setRestrictToProviders(null);
		// 	}

		// }else if(restrictToProviders){
		// 	setRestrictToProviders(null);
		// }

	}, [isOpen, wallets]);

	// const getTokensByCategory = useMemo((categoryName) => {
	// 	const tokens = fetchTokensByCategory(categoryName);
	// 	return tokens;
	// }, []);



	const identifierFromBalance = useCallback( (balance) => {
		return balance.chain + (balance.isSynthetic ? '/': '.') + balance.ticker + (balance.address && !balance.isGasAsset ? '-' + balance.address.toUpperCase().replace('0X', '0x') : '');
	}, []);




	useEffect(() => {
		console.log("TokenChooserDialog useEffect categories", categories);
		if(!categories || categories.length === 0) {

			fetchCategories().then((categories) => {
				console.log("categories", categories);
				setCategories(categories);
			});
	}
	}, []);

	//get tokens in selected category
	useEffect(() => {
		console.log("TokenChooserDialog useEffect selectedCategory", selectedCategory, tokens);
		if(selectedCategory && selectedCategory !== "") {
			if(selectedCategory === "wallet" && wallets && wallets.length > 0) {
				const walletTokens = wallets.reduce((acc, wallet) => {
					const balances = wallet.balance || [];
					const nonZeroBalances = balances.filter(balance => balance.bigIntValue !== '0');
					console.log("nonZeroBalances", nonZeroBalances);
					//filter out tokens that have a balance.bigIntValue of zero
					if (nonZeroBalances.length === 0){
						console.log("No tokens with non-zero balance in wallet", wallet);
						const tokenIdentifiers = balances.map(balance => identifierFromBalance(balance).toUpperCase());
						console.log("tokenIdentifiers", tokenIdentifiers);
						const walletTokens = tokens.filter(token => tokenIdentifiers.includes(token.identifier.replace('/', '.').toUpperCase()  ));
						return acc.concat(walletTokens);
					}
					 console.log("nonZero Wallet tokens", wallet, nonZeroBalances);
					const tokenIdentifiers = nonZeroBalances.map(balance => identifierFromBalance(balance).toUpperCase());
					console.log("tokenIdentifiers", tokenIdentifiers);	
					const walletTokens = tokens.filter(token => tokenIdentifiers.includes(token.identifier.toUpperCase()));
					console.log("walletTokens", walletTokens);
					return acc.concat(walletTokens);
				}, []);
				console.log("walletTokens All", walletTokens);
				setTokensByCategory({ ...tokensByCategory, [selectedCategory]: walletTokens });
			}else if(!tokensByCategory[selectedCategory]) {
				fetchTokensByCategory(selectedCategory).then((tokens) => {
					console.log("tokens in category", selectedCategory, tokens);
					setTokensByCategory({ ...tokensByCategory, [selectedCategory]: tokens });
				});
			}else{
				console.log("tokens in category already", selectedCategory, tokensByCategory[selectedCategory]);
			}
		}
	}, [selectedCategory, wallets, tokens]);



	// Filter tokens by selected category, if there is one selected
	const categoryFilteredTokens = useMemo(() => {
		console.log("Calculating categoryFilteredTokens with:", {
			selectedCategory,
			tokensByCategory,
			wallets,
			otherToken,
			tokens: tokens?.length || 0
		});
		
		if (!tokens || tokens.length === 0) {
			console.log("No tokens available for category filtering");
			return [];
		}
		
		if (!selectedCategory || selectedCategory === "") {
			console.log("No category selected, returning all tokens");
			return tokens;
		}
		
		if (selectedCategory === "wallet") {
			if (!wallets || wallets.length === 0) {
				console.log("No wallets available for wallet category");
				return [];
			}
			const result = tokens.filter(token => wallets.some(wallet => 
				wallet.balance?.some(balance => identifierFromBalance(balance) === token.identifier.replace('/', '.').toUpperCase().replace('0X','0x'))
			));
			console.log("Wallet category filtered tokens:", result);
			return result;
		}
		
		if (selectedCategory === "other") {
			if (!otherToken || otherToken.length === 0) {
				console.log("No other token available for other category");
				return [];
			}
			const result = tokens.filter(token => otherToken.some(other => 
				other.providers.some(provider => provider.includes(token.provider))
			));
			console.log("Other category filtered tokens:", result);
			return result;
		}

		// if a token is in the selected category, it will be in the tokensByCategory[selectedCategory] array with the same identifier
		if (!tokensByCategory[selectedCategory]) {
			console.log("No tokens in category:", selectedCategory);
			return [];
		}
		
		const result = tokens.filter(token => 
			tokensByCategory[selectedCategory].find(t => t.symbol?.toUpperCase() === token.ticker?.toUpperCase())
		);
		console.log("Category filtered tokens:", result);
		return result;

	}, [tokens, selectedCategory, tokensByCategory, wallets, otherToken, identifierFromBalance]);



	const providerFilteredTokens = useMemo(() => {
		console.log("Calculating providerFilteredTokens with:", {
			selectedProvider,
			categoryFilteredTokens: categoryFilteredTokens?.length || 0,
			restrictToProviders
		});
		
		if (!categoryFilteredTokens || categoryFilteredTokens.length === 0) {
			console.log("No tokens available from category filtering");
			return [];
		}
		
		let t = categoryFilteredTokens;
		
		if (restrictToProviders && restrictToProviders.length > 0) {
			const result = t.filter(token => restrictToProviders.includes(token.provider));
			console.log("Provider restricted tokens:", result);
			return result;
		}

		if (!selectedProvider || selectedProvider === "") {
			console.log("No provider selected, returning all category filtered tokens");
			return t;
		}
		
		const result = t.filter(token => token.provider === selectedProvider);
		console.log("Provider filtered tokens:", result);
		return result;
	}, [categoryFilteredTokens, selectedProvider, restrictToProviders]);


	const filteredTokens = useMemo(() => {
		console.log("Calculating filteredTokens with:", {
			tokens,
			selectedChain,
			selectedProvider,
			searchTerm,
			userInteracted,
			categoryFilteredTokens
		});

		const filtered = categoryFilteredTokens.filter(token => {
			return (!selectedChain || token.chain === selectedChain) &&
				(!selectedProvider || token.provider === selectedProvider) &&
				(!userInteracted || !searchTerm || token.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || token.identifier.toLowerCase() === searchTerm.toLowerCase());
		});

		// Enforce uniqueness after filtering
		const tokenMap = new Map();
		filtered.forEach(token => {
			const key = token.identifier.toLowerCase();
			if (!tokenMap.has(key)) {
				tokenMap.set(key, token);
			}
		});

		const result = Array.from(tokenMap.values());
		console.log("Final filteredTokens result:", result);
		return result;
	}, [tokens, selectedChain, selectedProvider, searchTerm, userInteracted, wallets, isOpen, otherToken, restrictToProviders, providerFilteredTokens, categoryFilteredTokens]);

	const uniqueChains = useMemo(() => {
		const chainSet = new Set();
		providerFilteredTokens.forEach(token => chainSet.add(token.chain));
		//sort MAYA then THORCHAIN then alphabetical
		return Array.from(chainSet).sort((a, b) => {
			if (a === 'MAYA') return -1;
			if (b === 'MAYA') return 1;
			if (a === 'THOR') return -1;
			if (b === 'THOR') return 1;
			return a.localeCompare(b);
		});
	}, [providerFilteredTokens]);

	const handleTokenClick = useCallback( token => {
		console.log("handleTokenClick", token);
		setSelectedToken(token);
		
		setUserInteracted(false); // Prevent filtering based on token identifier display
		setSearchTerm(token.identifier); // Update search term to reflect selected token identifier
	}, []);

	const handleProviderChange = useCallback( e => {
		console.log("handleProviderChange", e.target.value);
		setSelectedProvider(e.target.value);
		setSelectedChain("");
		setSearchTerm("");
		setUserInteracted(false);
	}, []);

	const handleChainClick = useCallback( chain => {
		setSelectedChain(chain);
		setSearchTerm("");
		setUserInteracted(false);
	}, []);

	const handleCategoryChange = useCallback( e => {
		console.log("handleCategoryChange", e.target.value);
		setSelectedCategory(e.target.value);
		setSelectedChain("");
		setSearchTerm("");
		setUserInteracted(false);
	}, []);


	const handleSearchChange = useCallback(debounce((value) => {
		setSearchTerm(value);
		setUserInteracted(true);

		// Auto-select chain if there is a matching token
		const matchedToken = tokens.find(token => token.identifier.toLowerCase() === value.toLowerCase());
		if (matchedToken) {
			setSelectedChain(matchedToken.chain);
		}
	}, 1), [tokens]); // Debounce search term changes

	useEffect(() => {
		// Setup
		return () => {
			// Cleanup
			handleSearchChange.cancel(); // This is how you cancel a debounced function with lodash
		};
	}, [handleSearchChange]);
	

	useEffect(() => {
		if (searchTextActive) {
			if (inputRef.current) {
				inputRef.current.focus();
			}
		}
	}, []);

	const beforeOnConfirm = useCallback( () => {
		console.log("beforeOnConfirm", searchTerm, selectedToken);
		//get token identifier from search term box
		const tokenIdentifier = searchTerm;
		//get token from tokens
		const token = tokens.find(token => token.identifier.toLowerCase() === tokenIdentifier.toLowerCase());
		if(!token){
			console.log("Token not found for identifier: ", tokenIdentifier);
			return;
		}

		token.identifier = token.identifier.replace('0X', '0x')
		//call onConfirm
		onConfirm(token);
		//close dialog
		onClose();
	}, [searchTerm, tokens, onConfirm, onClose]);

	useEffect(() => {
		if (searchTextActive) {
			inputRef.current.focus();
		}
	}, [searchTextActive]);


	useEffect(() => {
		if (searchTextActive) {
			inputRef.current.focus();
		}
	}, [searchTextActive]);
		if (!isOpen) return null;

	// Add effect to ensure tokens are loaded
	useEffect(() => {
		if ((!unfilteredTokens || unfilteredTokens.length === 0) && providerKey) {
			console.log("No tokens loaded, attempting to load tokens for provider key:", providerKey);
			// This will trigger the context to load tokens if they're not already loaded
		}
	}, [unfilteredTokens, providerKey]);

	// Add a loading indicator in the dialog
	if (isOpen && tokenLoadingStatus === 'loading') {
		return (
			<DialogBox
				title="Loading Tokens"
				isOpen={isOpen}
				onClose={onClose}
				icon=""
				buttons={[
					{ label: "Cancel", onClick: onClose }
				]}
				showMinMax={false}
				dialogClass="dialog-box-row-adapt"
				buttonClass="dialog-buttons-column"
			>
				<div className="token-chooser-dialog">
					<div className="loading-container" style={{ textAlign: 'center', padding: '20px' }}>
						<p>Loading tokens from providers...</p>
						<div className="loading-indicator"></div>
						<p>This may take a few moments.</p>
					</div>
				</div>
			</DialogBox>
		);
	}
	
	// Add an error state
	if (isOpen && tokenLoadingStatus === 'error') {
		return (
			<DialogBox
				title="Token Loading Error"
				isOpen={isOpen}
				onClose={onClose}
				icon=""
				buttons={[
					{ label: "Retry", onClick: () => {
						setTokenLoadingStatus('loading');
						if(window.loadProvidersAndTokens && typeof window.loadProvidersAndTokens === 'function'){
							window.loadProvidersAndTokens().catch(() => setTokenLoadingStatus('error'));
						}else{
							//reload the tokens
							loadTokens().catch(() => setTokenLoadingStatus('error'));


						}
					}},
					{ label: "Cancel", onClick: onClose }
				]}
				showMinMax={false}
				dialogClass="dialog-box-row-adapt"
				buttonClass="dialog-buttons-column"
			>
				<div className="token-chooser-dialog">
					<div className="error-container" style={{ textAlign: 'center', padding: '20px' }}>
						<p>Failed to load tokens. Please check your connection and try again.</p>
					</div>
				</div>
			</DialogBox>
		);
	}

	return (
		<DialogBox
			title="Select Token"
			isOpen={isOpen}
			onClose={onClose}
			onConfirm={() => beforeOnConfirm(selectedToken)}
			icon=""
			buttons={[
				{ label: "OK", onClick: () => beforeOnConfirm(selectedToken) },
				{ label: "Cancel", onClick: onClose }
			]}
			showMinMax={false}
			dialogClass="dialog-box-row-adapt"
			buttonClass="dialog-buttons-column"
		>
			<div className="token-chooser-dialog">
				<div className="file-text-box">
					<div className="label">Token Identifier:</div>
					<input
						key={windowId+'-search-text'}
						ref={inputRef}
						type="text"
						placeholder="Search token or enter identifier..."
						// {(searchTextActive ? { value={ searchTerm } } : {} )}
						className="search-text-box"
						value={searchTerm}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === 'Enter') {
								e.preventDefault();
								beforeOnConfirm(selectedToken);
							}

						}
						}
						onKeyUp={(e) => {
							e.stopPropagation();
						}
						}

						onChange={(e) => {
							e.stopPropagation();
							handleSearchChange(e.target.value);
						}
						}
						onFocusCapture={() => setSearchTextActive(true)}
						onBlur={() => setSearchTextActive(false)}
					/>
				</div>
					<div className="token-list">
						<ul>
							{filteredTokens.map(token => (
								<li key={`${token.chain}-${token.identifier}`} onClick={() => handleTokenClick(token)} onDoubleClick={() => beforeOnConfirm(token)} className={(selectedToken && selectedToken.identifier === token.identifier) ? "active" : ""}>
									{token.logoURI ? (
										<img
											ref={img => img && observer.current.observe(img)}
											data-src={token.logoURI}
											alt={token.name}
											className="token-icon"
											src="/waits.png"
										/>
									) : (
										<span className="no-icon">{token.ticker.split('')[0]}</span>
									)}
									{token.ticker} {token.name}{(token.identifier.includes('/')) ? ' (Synth)' : ''}
								</li>
							))}
						</ul>
					</div>
				<div className="category-dd">
					<div className="label">Tokens in category:</div>
					<div className="select-dropdown-button-wrapper	">
					<select onChange={handleCategoryChange} value={selectedCategory} className="select-dropdown-button">
						<option value="">All Tokens</option>
						<option value="wallet">Wallet Tokens</option>
						{categories.map(category => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					</div>
				</div>
				<div className="chains-for">
					<div className="label">Chains for:</div>
					{//provider name or all providers 
						selectedProvider && selectedProvider !== "" ? (
							<div className="provider-name">{providerNames[selectedProvider]}</div>

						) : (
							(!restrictToProviders || restrictToProviders.length === 0) ?
								<div className="provider-name">All Providers</div>
								: 
								<div className="provider-name">Providers for {otherToken.ticker}</div>
								
						)

					}

				</div>

				<div className="chain-list">
						<ul>
							{uniqueChains.map(chain => (
								<li
									key={chain}
									className={selectedChain === chain ? "active" : ""}
									onClick={() => handleChainClick(chain)}
								>
									{chainImages[chain] ? (
										<img
											ref={img => img && observer.current.observe(img)}
											data-src={chainImages[chain]}
											alt={chain}
											className="token-icon"
											src="/waits.png"

										/>
									) : (
										<span className="no-icon"> </span>
									)}

									{chain}
								</li>
							))}
						</ul>
					</div>	
				<div className="providers-dd">		
					<div className="label">Providers:</div>
					<div className="select-dropdown-button-wrapper	">

					<select onChange={handleProviderChange} value={selectedProvider} className="select-dropdown-button">
						<option value="">All Providers</option>
						{providers.map(provider => (
							(!restrictToProviders || restrictToProviders.includes(provider.provider)) && (
								<option key={provider.provider} value={provider.provider}>
									{providerNames[provider.provider]}
								</option>
							)
						))}
					</select>
					</div>
				</div>
				</div>
		</DialogBox>
	);
};

export default TokenChooserDialog;
