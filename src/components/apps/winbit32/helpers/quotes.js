import { AssetValue } from "@swapkit/sdk";
import { getQuoteFromChainflip, getQuoteFromSwapKit, getQuoteFromThorchainDirect } from "./quote";
import { amountInBigNumber } from "./quote";
import { SwapKitApi } from "@swapkit/api";
import bigInt from "big-integer";
import { getQuoteFromMaya } from "./maya";
import { forEach } from "lodash";
import { getAssetValue } from "./quote";

export const getQuotes = async (
	oSwapFrom,
	swapTo,
	amount,
	destinationAddress,
	slippage,
	setStatusText,
	setQuoteStatus,
	setRoutes,
	chooseWalletForToken,
	tokens,
	setDestinationAddress,
	setSelectedRoute,
	wallets,
	selectedRoute,
	license,
	setReportData,
	iniData,
	thorAffiliate,
	mayaAffiliate,
	setThorAffiliate,
	setMayaAffiliate,
	numChunks,
	chunkIntervalBlocks
) => {
	const thisDestinationAddress =
		destinationAddress || chooseWalletForToken(swapTo, wallets)?.address;
		//clone oSwapFrom

	let swapFrom = Object.assign({}, oSwapFrom);

	const currentSelectedRoute = selectedRoute || "optimal";

	if (swapFrom && swapTo && amount && thisDestinationAddress) {
		//setStatusText("");
		setQuoteStatus("Getting Quotes...", swapFrom, swapTo, amount);

		const basisPoints = license? 16:
			swapFrom.identifier.includes("/") || swapTo.identifier.includes("/")
				? 16
				: 32;
		
		let providerGroups = [["MAYACHAIN", "MAYACHAIN_STREAMING", "THORCHAIN", "THORCHAIN_STREAMING"]];
		const affiliates = [mayaAffiliate, thorAffiliate];	
		if(thorAffiliate !== mayaAffiliate || true){
			providerGroups = [
				["MAYACHAIN", "MAYACHAIN_STREAMING"],

				["THORCHAIN", "THORCHAIN_STREAMING"],
			];
		}

		//if(swapFrom.identifier === "XRD.XRD"){
		//https://mayanode.mayachain.info/mayachain/quote/swap?from_asset=XRD.XRD&to_asset=MAYA.CACAO&amount=2000000000&destination=maya1jpvhncl60k5q3dljw354t0ccg54j3pkjcag9ef&affiliate_bps=44&affiliate=cs
		//}

		const sellAsset =// (swapFrom.symbol)?  swapFrom.chain + "." + swapFrom.symbol:
						 swapFrom.identifier;
		const buyAsset = //(swapTo.symbol)? swapTo.chain + "." + swapTo.symbol: 
						swapTo.identifier;


		const quotesParams = providerGroups.map((providerGroup, index) => {
			const affiliate = affiliates[index];
			const swapKitQuoteParams = {
				sellAsset: sellAsset,
				buyAsset: buyAsset,
				sellAmount: parseFloat(amount).toString(),
				sourceAddress: chooseWalletForToken(swapFrom, wallets)?.address,
				destinationAddress: thisDestinationAddress,
				affiliateFee: basisPoints,
				affiliate: affiliate,
				slippage: slippage,
				providers: providerGroup,
			};
			return swapKitQuoteParams;
		});

		console.log("AssetValue", swapFrom, amount);

		const { assetValue } = await getAssetValue(swapFrom, amount);

		const chainflipQuoteParams = {
			sellAsset: swapFrom,
			buyAsset: swapTo,
			sellChain: swapFrom.chain,
			buyChain: swapTo.chain,
			assetValue,
			slippage: slippage || 1,
			sourceAddress: chooseWalletForToken(swapFrom, wallets)?.address,
			destinationAddress: thisDestinationAddress,
			affiliateBasisPoints: basisPoints.toString(),
		};

		console.log("chainflipQuoteParams", chainflipQuoteParams);

		// const mayaSwapQuoteParams = {
		// const thorSwapQuoteParams = {
		// 	sellAsset: swapFrom.identifier,
		// 	sellAmount: amount,
		// 	buyAsset: swapTo.identifier,
		// 	senderAddress: chooseWalletForToken(swapFrom, wallets)?.address,
		// 	recipientAddress: thisDestinationAddress,
		// 	slippage: slippage,
		// 	affiliateBasisPoints: basisPoints.toString(),
		// 	affiliateAddress: "be",
		// };

		const quoteFuncs = quotesParams.map((quoteParams) => {
			console.log("quoteParams", quoteParams);
			if (quoteParams.providers.some(p => p === "THORCHAIN" || p === "THORCHAIN_STREAMING")) {
				// Create two separate Thorchain quote requests
				return async () => {
					const [normalQuote, streamingQuote] = await Promise.all([
						// Normal quote
						getQuoteFromThorchainDirect({
							...quoteParams,
							streaming_interval: 0,
							streaming_quantity: 0
						}),
						// Streaming quote
						getQuoteFromThorchainDirect({
							...quoteParams,
							streaming_interval: 1,
							streaming_quantity: 0 // Let THORChain determine optimal chunks
						})
					]);

					 // Calculate USD values for each route using total amount
					 const calculateUSDValue = (route) => {
						const totalOutput = Number(route.expectedBuyAmount);
						// Total fees in the output asset
						const totalFees = (Number(route.fees.affiliate) + 
										 Number(route.fees.outbound) + 
										 Number(route.fees.liquidity)) / 1e8;
						
						const totalValue = totalOutput + totalFees;
						// Get USD price from thorchain quote data
						const assetPrice = route.thorchainQuote.fees?.asset_price || 1;
						return totalValue * assetPrice;
					  };

					// Combine both quotes into one response
					return {
						quoteId: normalQuote.quoteId,
						routes: [
							{
								...normalQuote.routes[0],
								providers: ["THORCHAIN"],
								expectedOutputUSD: calculateUSDValue(normalQuote.routes[0])
							},
							{
								...streamingQuote.routes[0],
								providers: ["THORCHAIN_STREAMING"],
								streamingSwap: true,
								expectedOutputUSD: calculateUSDValue(streamingQuote.routes[0])
							}
						]
					};
				};
			}
			// Remove THORCHAIN from SwapKit providers
			quoteParams.providers = quoteParams.providers.filter(p => 
				!p.includes("THORCHAIN")
			);
			return () => getQuoteFromSwapKit(quoteParams);
		});

		//add chainflip to the list of quotes
		
		quoteFuncs.push(() => getQuoteFromChainflip(chainflipQuoteParams));

		let retry = false;

		try {
			const responses = await Promise.allSettled(quoteFuncs.map((quoteFunc) => quoteFunc()));
			
			//				getQuoteFromMaya(quotesParams[0], swapTo, swapFrom),

			// let responses = [];
			// quotesParams.forEach(async (quotesParam) => {
			// 	try{
			// 		const response = await getQuoteFromSwapKit(quotesParam);
			// 		responses.push(response);
			// 	}catch(error){
			// 		console.error("Error getting quotes from SwapKit:", error);
			// 		responses.push({status: "rejected", value: error.message});
			// 	}
			// });

			let swapKitRoutes = [];
			//check for thornameAffiliate errors

			responses.forEach((response, index) => {
				console.log("response", response);
				if(!response.value) {
					return;
				}
				if (response.value.providerErrors && response.value.providerErrors.length) {
					response.value.providerErrors.forEach((error) => {

						if (error.errorCode === "thornameAffiliate") {
							retry = true;
							if (index === 0) {
								console.log("setting mayaAffiliate to be");
								setMayaAffiliate("be");
							} else {
								console.log("setting thorAffiliate to be");
								setThorAffiliate("be");
							}
						}
					});
				}
				if (response.status === "fulfilled") {
					console.log("response", response);
					
					const routes =	processSwapKitRoutes(response.value, swapTo.decimals)
					swapKitRoutes = swapKitRoutes.concat(routes);
				}
			});
			if (retry) {
				throw new Error("Retry");
			}
			// const swapKitRoutes =
			// 	swapKitResponse.status === "fulfilled"
			// 		? processSwapKitRoutes(swapKitResponse.value, swapTo.decimals)
			// 		: [];
			// const thorSwapRoutes =
			// 	thorSwapResponse.status === "fulfilled"
			// 		? processThorSwapRoutes(thorSwapResponse.value)
			// 		: [];

			// const combinedRoutes = [...swapKitRoutes, ...thorSwapRoutes];

			const combinedRoutes = [...swapKitRoutes];

			if (combinedRoutes.length === 0) {
				throw new Error("No routes from any source.");
			}
			console.log("combinedRoutes", combinedRoutes);
			setRoutes(combinedRoutes);
			// setQuoteId(swapKitRoutes?.value?.quoteId);

			//see if selectedRoute is still valid
			const selectedRouteIndex = combinedRoutes.findIndex(
				(route) => route.providers?.join(",") === currentSelectedRoute
			);
			if (!selectedRouteIndex || selectedRouteIndex === -1) {
				setSelectedRoute("optimal");
			}

			//const optimalRoute =
			//		combinedRoutes.find(({ optimal }) => optimal) || combinedRoutes[0];

			//optimal is one with biggest 	optimalRoute.expectedOutputMaxSlippage ||	optimalRoute.expectedBuyAmountMaxSlippage
			const optimalRoute = combinedRoutes.reduce((a, b) => {
				const aVal = amountInBigNumber(
					a.expectedOutputMaxSlippage || a.expectedBuyAmountMaxSlippage,
					swapTo.decimals
				);
				const bVal = amountInBigNumber(
					b.expectedOutputMaxSlippage || b.expectedBuyAmountMaxSlippage,
					swapTo.decimals
				);
				return aVal.isGreaterThanOrEqualTo(bVal) ? a : b;
			});

			//add "optimal" flag to correct entry in combinedRoutes and remove any others
			combinedRoutes.forEach((route) => {
				route.optimal = route === optimalRoute;
			});

			const optimalRouteTime =
				optimalRoute.estimatedTime === null ||
				optimalRoute.estimatedTime === undefined
					? optimalRoute.timeEstimates
						? Object.values(optimalRoute.timeEstimates).reduce(
								(a, b) => a + b,
								0
						  ) / 6000
						: 0
					: typeof optimalRoute.estimatedTime === "object"
					? optimalRoute.estimatedTime.total / 60
					: optimalRoute.estimatedTime / 60;

			if (!destinationAddress)
				setDestinationAddress(chooseWalletForToken(swapTo, wallets)?.address);
			const expectedUSD =
				optimalRoute.expectedOutputUSD ||
				optimalRoute.expectedBuyAmount *
					optimalRoute.meta?.assets.find(
						(asset) =>
							asset.asset.toUpperCase() === optimalRoute.buyAsset.toUpperCase()
					)?.price;
			const minRecd = amountInBigNumber(
				optimalRoute.expectedOutputMaxSlippage ||
					optimalRoute.expectedBuyAmountMaxSlippage,
				swapTo.decimals
			).toString();

			if (setReportData) {
				console.log("setting report data");
				let quoteSection = {};
				forEach(providerGroups, (providerGroup, index) => {
					const swapKitQuoteParams = quotesParams[index];
					const swapKitResponse = responses[index];
					quoteSection[providerGroup[0]] = {
						quoteId: swapKitResponse.value?.quoteId,

						quoteStatus:
							swapKitResponse.status === "fulfilled" ? "Success" : "Error",
						quoteError:
							swapKitResponse.status === "fulfilled"
								? ""
								: swapKitResponse.reason,
						quoteSource: "SwapKit",
						quoteParams: swapKitQuoteParams,
						quoteResponse: swapKitResponse.value,
					};
				});

				setReportData({
					Quote: {
						quoteTime: new Date().toISOString(),
						quotes: quoteSection,
						quoteRoutes: combinedRoutes,
						optimalRoute: optimalRoute,
						optimalRouteTime: optimalRouteTime,
						expectedUSD: expectedUSD,
						minRecd: minRecd,
						destinationAddress: thisDestinationAddress,
						swapFrom: swapFrom,
						swapTo: swapTo,
						amount: amount,
						slippage: slippage,
						license: license,
					},
					ini: iniData,
					Log: [quotesParams, combinedRoutes],
				});
			}

			setQuoteStatus(
				<>
					<div>
						<span>Optimal: </span>
						<span>{optimalRoute.providers.join(", ")} </span>
					</div>
					<div>
						<span>Time (In+Swap+Out)</span>
						<span>
							{parseFloat(parseFloat(optimalRouteTime).toPrecision(3))} mins
						</span>
					</div>
					<div>
						<span>Min {swapTo?.ticker}:</span>
						<span>
							{" "}
							{parseFloat(
								parseFloat(
									optimalRoute.expectedOutputMaxSlippage ||
										optimalRoute.expectedBuyAmountMaxSlippage
								).toPrecision(5)
							)}{" "}
						</span>
					</div>
					<div>
						<span>Expected Equivalent: </span>
						<span>
							{parseFloat(parseFloat(expectedUSD).toPrecision(6))} USD
						</span>
					</div>
					{optimalRoute.streamingSwap && (
						<div>
							<i>
								Streaming Swap
								<br />
							</i>
						</div>
					)}
					{expectedUSD < 0 && (
						<div>
							<i>Low Value Swap. Might require High Slippage</i>
						</div>
					)}
				</>
			);

			return combinedRoutes;
		} catch (error) {
			console.error("Error getting quotes from both sources:", error);
			if(error.message === "Retry" || retry){
				return 'retry';
			}
			setQuoteStatus("Error getting quotes: " + error.message);
		}
	}
};

const processSwapKitRoutes = (response, swapToDecimals) => {
	const routes = response.routes;
	const quoteid = response.quoteId;
	routes.forEach((route) => {
		route.quoteId = quoteid;
		
		// Handle both array and object fee structures
		if (Array.isArray(route.fees)) {
			route.gasFee = route.gasFee || route.fees.find((fee) => fee.type === "inbound")?.amount;
		} else if (typeof route.fees === 'object') {
			route.gasFee = route.fees?.gas?.estimated || route.gasFee;
		}
		
		// Rest of the memo handling
		if (route.memo && (route.providers.includes("MAYACHAIN") || route.providers.includes("MAYACHAIN_STREAMING"))){
			route.originalMemo = route.memo;
			const parts = route.memo.split(":");
			if (parts.length > 3) {
				const splitP3 = parts[3].split("/");
				parts[3] = Math.floor(
					amountInBigNumber(
						route.expectedOutputMaxSlippage ||
							route.expectedBuyAmountMaxSlippage,
						swapToDecimals > 8 ? 8 : swapToDecimals
					)
				).toString();
				console.log("parts[3]", parts[3], splitP3, route.expectedOutputMaxSlippage, route.expectedBuyAmountMaxSlippage, swapToDecimals);
				if (splitP3.length > 1) {
					parts[3] += "/" + splitP3.slice(1).join("/");
				}
				route.memo = parts.join(":");
			}
		}
	});

	return routes;
};

const processThorSwapRoutes = (response) => {
	return response.routes;
};
