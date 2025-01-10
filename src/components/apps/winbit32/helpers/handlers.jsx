import { saveAs } from "file-saver";
import { amountInBigNumber, getAssetValue, getQuoteFromSwapKit } from "./quote";
import { AssetValue, RequestClient, SwapKitNumber } from "@swapkit/helpers";
import { FeeOption, SwapKitApi } from "@swapkit/sdk";
import { ChainIdToChain } from "@swapkit/sdk";
import { getTxnDetails, getTxnDetailsV2, getTxnUrl } from "./transaction";
import { getTokenForProvider } from './token';
import { re } from "mathjs";

export const chooseWalletForToken = (token, wallets) => {
	if (!token) return null;
	if (!wallets) return null;
	return wallets.find((wallet) => wallet.chain === token.chain);
};


const getFeeOption = (feeOption) => {
	switch (feeOption.toLowerCase()) {
		case "fast":
			return FeeOption.Fast;
		case "average":
			return FeeOption.Average;
		case "fastest":
			return FeeOption.Fastest;
		default:
			return FeeOption.Average;
	}
};



export const handleApprove = async (
	swapFrom,
	amount,
	skClient,
	wallets,
	setStatusText,
	setSwapInProgress,
	setShowProgress,
	setProgress,
	setExplorerUrl,
	routes,
	selectedRoute,
	chainflipBroker
) => {
	setSwapInProgress(true);
	setShowProgress(true);
	setProgress(0);

	const route =
		selectedRoute === "optimal" && routes.length > 0
			? routes.find(({ optimal }) => optimal) || routes[0]
			: routes.find(
					(route) => route.providers.join(", ") === selectedRoute
				);

	if (!route) {
		setStatusText("No route selected");
		setSwapInProgress(false);
		setShowProgress(false);
		return;
	}

	const wallet = chooseWalletForToken(swapFrom, wallets);

	const dotWallet = wallets.find((wallet) => wallet.chain === "DOT");

	if("CHAINFLIP" === route.providers[0] || "CHAINFLIP_DCA" === route.providers[0]){
		
		setStatusText("Approve not required for Chainflip");
		return;

		const {broker, toolbox} = await chainflipBroker(dotWallet);
		console.log("broker", broker);
		console.log("toolbox", toolbox);

// 		const requestSwapDepositAddress =
//   (toolbox: Awaited<ReturnType<typeof ChainflipToolbox>>) =>
//   async ({
//     route,
//     sellAsset,
//     buyAsset,
//     recipient: _recipient,
//     brokerCommissionBPS = 0,
//     ccmMetadata,
//     maxBoostFeeBps,
//   }: RequestSwapDepositAddressParams) => {



		const targetAddress = await skClient.chainflip.requestSwapDepositAddress({
			route: route,
			sellAsset: swapFrom,
			buyAsset: swapFrom,
			recipient: wallet.address,
			brokerCommissionBPS: 32,

		}).catch((error) => {
			console.log("error", error);
			setStatusText("Error getting target address " + error.message);
			setSwapInProgress(false);
			setShowProgress(false);
			return null;
		});

		console.log("targetAddress", targetAddress);
		setStatusText("Approving...");
		setProgress(13);
		return;
	}



	setStatusText("Approving...");
				console.log("Approving...", swapFrom, amount, route, wallet, swapFrom.decimals);
	const assetValue = await getAssetValue(
		swapFrom,
		amount,
	);



	// const ApproveParams = {
	// 	assetValue,
	// 	spenderAddress: route.contract || route.targetAddress,
	// };

//export type ApproveParams = {
//   assetAddress: string;
//   spenderAddress: string;
//   feeOptionKey?: FeeOption;
//   amount?: BigNumberish;
//   from: string;
//   // Optional fallback in case estimation for gas limit fails
//   gasLimitFallback?: BigNumberish;
//   nonce?: number;
// };

	const ApproveParams = {
		assetAddress: swapFrom.address,
		spenderAddress: route.contract || route.targetAddress,
		feeOptionKey: FeeOption.Average,
		amount: assetValue.assetValue.bigIntValue,
		from: wallet.address,
	};

	console.log("ApproveParams", ApproveParams, route);
	setProgress(13);

	const approveTxnHash = await wallet
		.approve(ApproveParams)
		.catch((error) => {
			console.log("error", error);
			setStatusText("Error approving transaction " + error.message);
			setSwapInProgress(false);
			setShowProgress(false);
			return null;
		});
	if(!approveTxnHash){
		return null;
	}
	console.log("approveTxnHash", approveTxnHash);
	try{
		const explURL = getTxnUrl(approveTxnHash, wallet.chain, skClient);
		if(!explURL){
			setStatusText("Approval transaction sent but unknown result.");
			setSwapInProgress(false);
			setShowProgress(false);
			return null
		}
		console.log("explURL", explURL);
		setExplorerUrl(explURL);
		setShowProgress(false);
		setStatusText("Approval transaction sent");
		setSwapInProgress(false);
		setProgress(0);
		return approveTxnHash;
	}catch(error){
		setStatusText("Transaction Approval sent but error getting result " + error.message);
		setSwapInProgress(false);
		setShowProgress(false);
		return null;
	}

};

export const handleSwap = async (
	swapFrom,
	swapTo,
	amount,
	destinationAddress,
	routes,
	selectedRoute,
	slippage,
	skClient,
	wallets,
	setStatusText,
	setSwapInProgress,
	setShowProgress,
	setProgress,
	setTxnHash,
	setExplorerUrl,
	setTxnStatus,
	setTxnTimer,
	tokens,
	swapInProgress,
	feeOption,
	currentTxnStatus,
	chainflipBroker,
	isStreamingSwap,
	streamingInterval,
	streamingNumSwaps,
	setReportData,
	iniData,
	license,
	doSwap = true,
	setRoutes
) => {
	if (swapInProgress) return;
	setSwapInProgress(true);

	if (
		!swapFrom ||
		!swapTo ||
		!amount ||
		!destinationAddress ||
		!routes ||
		routes.length === 0

	) {
		setStatusText("Missing required fields or quote");
		setSwapInProgress(false);
		return;
	}

	setShowProgress(true);
	setProgress(0);

	console.log("SelectedRoute", selectedRoute);

	const wallet = chooseWalletForToken(swapFrom, wallets);
	if (!wallet) {
		setStatusText("No wallet found for selected token");
		setSwapInProgress(false);
		setShowProgress(false);
		return;
	}
	console.log("wallet", wallet);

	// try {
	const oRoute =
		selectedRoute === "optimal" && routes.length > 0
			? routes.find(({ optimal }) => optimal) || routes[0]
			: routes.find((route) => route.providers.join(", ") === selectedRoute);

	//clone route
	const route = oRoute ? JSON.parse(JSON.stringify(oRoute)) : null;

	if (!route || route.disabled) {
		setStatusText("No route selected");
		setSwapInProgress(false);
		setShowProgress(false);
		return;
	}

	if(isStreamingSwap && route.memo){
		const parts = route.memo.split(":");
		const splitP3 = parts[3].split("/");
		const newSplitP3 = splitP3[0] + '/' + streamingInterval + '/' + streamingNumSwaps;
		parts[3] = newSplitP3;
		route.memo = parts.join(":");

	}


	console.log("route", route);

	//ensure the right version of the token is used
	swapFrom = getTokenForProvider(tokens, swapFrom, route.providers[0]);

	console.log("route", route);
	setTxnHash("");
	setExplorerUrl("");
	setTxnStatus(null);
	setProgress(8);
	const { assetValue, otherBits } = await getAssetValue(swapFrom, amount);

	console.log("assetValue", assetValue, swapFrom, amount, otherBits);

	let cfAddress = null;
	if (route.providers[0] === "CHAINFLIP" || route.providers[0] === "CHAINFLIP_DCA") {
		const dotWallet = wallets.find((wallet) => wallet.chain === "DOT");

		const { broker, toolbox } = await chainflipBroker(dotWallet || wallet);
		console.log("broker", broker);
		console.log("toolbox", toolbox);

		// 		const requestSwapDepositAddress =
		//   (toolbox: Awaited<ReturnType<typeof ChainflipToolbox>>) =>
		//   async ({
		//     route,
		//     sellAsset,
		//     buyAsset,
		//     recipient: _recipient,
		//     brokerCommissionBPS = 0,
		//     ccmMetadata,
		//     maxBoostFeeBps,
		//   }: RequestSwapDepositAddressParams) => {
		//get min amount out of swapto token
		const minOutToken = route.expectedBuyAmountMaxSlippage;

		const { assetValue: swapToAssetValue } = await getAssetValue(
			swapTo,
			minOutToken
		);
		console.log(
			"swapToAssetValue",
			swapToAssetValue.toString(),
			assetValue.toString()
		);

		// 	export async function getDepositAddress({
		//   buyAsset,
		//   sellAsset,
		//   recipient,
		//   brokerEndpoint,
		//   maxBoostFeeBps,
		//   brokerCommissionBPS,
		//   ccmParams,
		//   chainflipSDKBroker,
		// }: {
		//   buyAsset: AssetValue;
		//   sellAsset: AssetValue;
		//   recipient: string;
		//   brokerEndpoint: string;
		//   maxBoostFeeBps: number;
		//   brokerCommissionBPS?: number;
		//   ccmParams?: DepositAddressRequest["ccmParams"];
		//   chainflipSDKBroker?: boolean;
		// }) {



		try {
			cfAddress = await skClient.chainflip.getDepositAddress({
				route: route,
				sellAsset: assetValue,
				buyAsset: swapToAssetValue,
				recipient: destinationAddress,
				brokerCommissionBPS: license ? 16 : 32,
				maxBoostFeeBps: 0,
				chainflipSDKBroker: true,
				brokerEndpoint: "https://chainflip.winbit32.com",
				slippage: slippage,
				numChunks: Number(streamingNumSwaps),
				chunkIntervalBlocks: Number(streamingInterval),
				sender: wallet.address,
			});

			if(cfAddress.error){
				setStatusText("Error getting target address " + cfAddress.error);
				setSwapInProgress(false);
				setShowProgress(false);
				return null;
			}

		} catch (error) {
			console.log("error", error);
			setStatusText("Error getting target address " + error.message);
			setSwapInProgress(false);
			setShowProgress(false);
			return null;
		}

		if(!doSwap){
			const explorerUrl = "https://scan.chainflip.io/channels/" + cfAddress.channelId;
			setStatusText(
				<>Deposit Address: <a href={explorerUrl} target="_blank" rel="noopener noreferrer">{explorerUrl}</a></>
			);
			setSwapInProgress(false);
			setShowProgress(false);
			setExplorerUrl(explorerUrl);

			//loop through routes, if they have cfQuote then add deposit address

			setRoutes((prev) => 
				prev.map((r) => {
					if (r.cfQuote) {
						r.cfQuote.depositAddress = cfAddress.depositAddress;
					}
					return r;
				})
			);



			//open channel in new window
			window.open("https://scan.chainflip.io/channels/" + cfAddress.channelId, "_blank");

			return;
		}

		console.log("targetAddress", cfAddress);
		setProgress(9);
	} else if (
		wallet.chain === "ETH" ||
		wallet.chain === "BSC" ||
		wallet.chain === "POLYGON" ||
		wallet.chain === "AVAX" ||
		wallet.chain === "ARB" ||
		wallet.chain === "OP"
	) {
		console.log("wallet.chain", wallet.chain);
		const ApproveParams = {
			assetValue,
			spenderAddress: route.contract || route.targetAddress,
		};

		console.log("ApproveParams", ApproveParams);

		const allowance = await skClient
			.isAssetValueApproved(ApproveParams)
			.catch((error) => {
				setStatusText("Error checking allowance");
				setSwapInProgress(false);
				setShowProgress(false);
				return null;
			});
		console.log("allowance", allowance);
		if (!allowance) {
			setStatusText("Approval Required");
			setSwapInProgress(false);
			setShowProgress(false);
			return;
		}
	}
	console.log("route.sellAmount Before", route.sellAmount);

	setProgress(12);
	if (otherBits.decimalDifference !== 0) {
		route.sellAmount = parseFloat(
			route.sellAmount / 10 ** otherBits.decimalDifference
		);
	// } else if (swapFrom.identifier.toLowerCase() === "maya.cacao") {
	// 	route.sellAmount = route.sellAmount * 100;
	}

	console.log("route.sellAmount", route.sellAmount);

	if(route.sellAsset === 'XRD.XRD'){
		route.sellAsset = route.sellAsset + '-resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd';
		//route.sellAmount = route.sellAmount / 1000000000000000000;
	}

	const swapParams = {
		route: route,
		streamSwap: route.streamingSwap ? true : false,
		feeOption: getFeeOption(feeOption),
		recipient: destinationAddress,
	
	};

	//set report data with clones so stays static
	setReportData({
		swapParams: { ...swapParams },
		ini: iniData?.trim(),
	});

	if (route.providers[0].match(/^MAYACHAIN/))
		 swapParams.pluginName = "mayachain";
	else if (route.providers[0].match(/^THORCHAIN/))
		 swapParams.pluginName = "thorchain";
	else if (route.providers[0] === "CHAINFLIP" || route.providers[0] === "CHAINFLIP_DCA"){
		swapParams.pluginName = "chainflip";
		// swapParams.recipientAddress = cfAddress.depositAddress;
		// swapParams.chainflipBrokerUrl = "http://chainflip.winbit32.com:10997";

		//send to the recipient address
		const txData = {
			assetValue: assetValue,
			from: wallet.address,
			recipient: cfAddress.depositAddress,
			isPDA: true,
			isProgramDerivedAddress: true,
			setStatusTextMessage: setStatusText,
		};
		setProgress(13);
		console.log("Sending funds:", txData, wallet);

		try {
			const txID = await wallet.transfer(txData);
			const txExplorerUrl = getTxnUrl(txID, wallet.chain, skClient);
			setExplorerUrl(txExplorerUrl);
			setProgress(87);
			const explorerUrl =
				"https://scan.chainflip.io/channels/" + cfAddress.channelId;
			console.log("Explorer URL:", explorerUrl);

			//add tx info to reportData
			setReportData(prev => {
				return {
					...prev,
					result: {txData: txData,
					txID: txID,
					explorerUrl: explorerUrl}
				}
			});



			setProgress(93);
			setExplorerUrl(explorerUrl);
			setProgress(100);
			setSwapInProgress(false);
			return;
		} catch (error) {
			console.error("Error sending funds:", error);
			setStatusText("Error sending funds: " + error.message);
			setSwapInProgress(false);
			setShowProgress(false);
			return;
		}
	}

	console.log("swapParams", swapParams);

	const swapResponse = await skClient.swap(swapParams).catch((error) => {
		setStatusText("Error swapping:: " + error.message);
		//add tx info to reportData
		setReportData(prev => {
			return {
				...prev,
				result: {error: error.message}
			}
		});
		setSwapInProgress(false);
		setShowProgress(false);
		return null;
	});

	if (!swapResponse) return;


	//add tx info to reportData
	setReportData(prev => {
		return {
			...prev,
			result: {swapResponse: swapResponse}
		}
	});

	const walletChain = ChainIdToChain[wallet.chainId];
	try {
		const exURL = getTxnUrl(swapResponse, walletChain, skClient);
			
		setExplorerUrl(exURL);

		//add explorer url to reportData.result
		setReportData(prev => {
			return {
				...prev,
				result: {explorerUrl: exURL, swapResponse: swapResponse}
			}
		});

		console.log("exURL", exURL);
	} catch (error) {
		console.log("Transaction sent but error getting result " + error.message);
		setStatusText("Transaction sent");
		setSwapInProgress(false);
		setShowProgress(false);
		return;
	}

	// Function to log properties for debugging
	// Function to log properties for debugging
	function logObjectProperties(obj, name) {

		setReportData(prev => {
			if(!prev.log) prev.log = [];
			
			return {
				...prev,
				log: [{name: obj, value: JSON.stringify(obj, null, 2)}, ...prev.log]
			}
		});

		console.log(`${name}:`, JSON.stringify(obj, null, 2));
	}

	// Function to create a base64 encoded value for transaction messages
	function createBase64Value(data) {
		if (typeof window !== "undefined" && typeof window.btoa === "function") {
			// Browser environment
			const encoder = new TextEncoder();
			const dataBuffer = encoder.encode(JSON.stringify(data));
			return btoa(String.fromCharCode(...dataBuffer));
		} else {
			// Node.js environment
			return Buffer.from(JSON.stringify(data)).toString("base64");
		}
	}

	// Construct the transaction object with messages array
	const transactionBit = {
		memo: route.memo,
		messages: [
			{
				type_url: "/types.MsgDeposit",
				value: createBase64Value({ memo: route.memo }),
			},
		],
		...(route.transaction || {}),
	};
	logObjectProperties(transactionBit, "transactionBit");

	// Prepare the route object with the transaction
	const routeWithTransaction = {
		...route,
		transaction: transactionBit,
	};
	logObjectProperties(routeWithTransaction, "routeWithTransaction");

	// Construct the txDetailsToSend object
	const txDetailsToSend = {
		txn: {
			hash: swapResponse,
			quoteId: route.quoteId,
			route: routeWithTransaction,
			feeOption: swapParams.feeOption,
			recipient: swapParams.recipient,
			pluginName: swapParams.pluginName,
			memo: route.memo,
		},
		route: routeWithTransaction,
	};
	logObjectProperties(txDetailsToSend, "txDetailsToSend");
	setStatusText("Transaction Sent");

	// Send the transaction details
	const txDetails = await getTxnDetails(txDetailsToSend).catch((error) => {

		const txDetailsV2 = getTxnDetailsV2(swapResponse, route.sourceAddress)
			.then((txDetailsV2) => {
				console.log("txDetailsV2", txDetailsV2);
				if (txDetailsV2) {
					txDetailsV2.done = false;
					txDetailsV2.lastCheckTime = 1;

					currentTxnStatus.current = txDetailsV2;
					return txDetailsV2;
				}
			})
			.catch((error) => {
				console.log("error", error);
				setStatusText("Cannot follow this tx. Check Navigator");
				setSwapInProgress(false);
				setShowProgress(false);
				return { done: true, status: "pending", lastCheckTime: 1 };
			});
		return txDetailsV2;
	});
	console.log("txDetails", txDetails);

	if (txDetails?.done === true) {
		setStatusText("Transaction Successfully Started");
		setSwapInProgress(false);
		setShowProgress(false);
		return;
	}else if(txDetails?.message.includes("Server Error")){
		setStatusText("Process Started, Click 'View TX' to see progress");
		setSwapInProgress(false);
		setShowProgress(false);
		return;
	}

	txDetails.done = false;
	txDetails.status = "pending";
	txDetails.lastCheckTime = 1;
	currentTxnStatus.current = txDetails;

	setTxnStatus(txDetails);
	setTxnHash(swapResponse);

	setProgress(13);
	// } catch (error) {
	// 	setStatusText("Error swapping: " + error.message);
	// //} finally {
	// 	setSwapInProgress(false);
	// 	setShowProgress(false);
	// }
};

export const handleTokenSelect = (
	token,
	currentTokenSetter,
	closeTokenDialog
) => {
	if (currentTokenSetter) {
		currentTokenSetter(token);
	}
	closeTokenDialog();
};

export const updateDestinationAddress = (
	swapTo,
	wallets,
	setDestinationAddress,
	setUsersDestinationAddress
) => {
	if (swapTo && wallets && wallets.length > 0) {
		const wallet = chooseWalletForToken(swapTo, wallets);
		if (wallet) {
			setDestinationAddress(wallet.address);
			setUsersDestinationAddress(wallet.address);
		}
	}
};

export const delayedParseIniData = (
	_iniData,
	setIniData,
	setSwapFrom,
	setSwapTo,
	setAmount,
	setDestinationAddress,
	setFeeOption,
	setSlippage,
	setSelectedRoute,
	setRoutes,
	routes,
	tokens,
	setManualStreamingSet, setStreamingInterval, setStreamingNumSwaps
) => {
	setIniData(_iniData);
	setTimeout(() => {
		parseIniData(
			_iniData,
			setSwapFrom,
			setSwapTo,
			setAmount,
			setDestinationAddress,
			setFeeOption,
			setSlippage,
			setSelectedRoute,
			setRoutes,
			routes,
			tokens,
			setManualStreamingSet,
			setStreamingInterval,
			setStreamingNumSwaps
		);
	}, 1000);
};

const parseIniData = (
	data,
	setSwapFrom,
	setSwapTo,
	setAmount,
	setDestinationAddress,
	setFeeOption,
	setSlippage,
	setSelectedRoute,
	setRoutes,
	routes,
	tokens,
	setManualStreamingSet,
	setStreamingInterval,
	setStreamingNumSwaps
) => {
	const lines = data.split("\n");
	lines.forEach((line) => {
		if (line.startsWith(";")) return;

		const [key, value] = line.split("=");
		switch (key.trim()) {
			case "token_from":
				const fromToken = tokens.find(
					(token) =>
						token.identifier.toLowerCase() === value.trim().toLowerCase()
				);
				if (fromToken) {
					fromToken.identifier = fromToken.identifier.replace("0X", "0x");
					setSwapFrom(fromToken);
				}else{
					console.log("Token not found", value.trim().toLowerCase());
				}
				break;
			case "token_to":
				const toToken = tokens.find(
					(token) =>
						token.identifier.toLowerCase() === value.trim().toLowerCase()
				);
				if (toToken) {
					toToken.identifier = toToken.identifier.replace("0X", "0x");
					setSwapTo(toToken);
				}else{
					console.log("Token not found", value.trim().toLowerCase());
				}
				break;
			case "amount":
				setAmount(value.trim());
				break;
			case "destination":
				setDestinationAddress(value.trim());
				break;
			case "fee_option":
				setFeeOption(value.trim());
				break;
			case "slippage":
				setSlippage(parseFloat(value.trim()));
				break;
			case "route":
				if(!value.trim() || value.trim() === "optimal"){
					console.log("Setting optimal route", value.trim());
					setSelectedRoute("optimal");	
				}else{
					let sr = '';
					if (routes && routes.length > 0) {
						const route = routes.find(
							(route) => route.providers.join(", ") === value.trim()
						);
						if (route) {
							sr = route.providers.join(", ");
						}
					}
					if (!sr) 
						{
							//add the route to the list
							sr = value.trim();
							routes.push({providers: value.trim().split(","), optimal: false, disabled: true, });
							console.log("Adding route", sr, value.trim(), routes);
							setRoutes([...routes]);
						}

					console.log("Setting route", sr, value.trim(), routes);
					setSelectedRoute(
						sr
					);
				}
				break;
			case "swap_count":
				setManualStreamingSet(true);
				setStreamingNumSwaps(parseInt(value.trim()));
				break;
			case "swap_interval":
				setManualStreamingSet(true);
				setStreamingInterval(parseInt(value.trim()));
				break;
			default:
				break;
		}
	});
};
