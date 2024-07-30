import { saveAs } from "file-saver";
import { amountInBigNumber, getAssetValue, getQuoteFromSwapKit } from "./quote";
import { AssetValue, RequestClient, SwapKitNumber } from "@swapkit/helpers";
import { FeeOption, SwapKitApi } from "@swapkit/sdk";
import { ChainIdToChain } from "@swapkit/sdk";
import { getTxnDetails, getTxnDetailsV2 } from "./transaction";
import { getTokenForProvider } from './token';

export const chooseWalletForToken = (token, wallets) => {
	if (!token) return null;
	if (!wallets) return null;
	return wallets.find((wallet) => wallet.chain === token.chain);
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

	if("CHAINFLIP" === route.providers[0]){
		setStatusText("Chainflip not yet supported");
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


		const targetAddress = await broker.requestSwapDepositAddress({
			route: route,
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
	const ApproveParams = {
		assetValue,
		spenderAddress: route.contract || route.targetAddress,
	};
	console.log("ApproveParams", ApproveParams, route);
	setProgress(13);

	const approveTxnHash = await skClient.evm
		.approveAssetValue(ApproveParams)
		.catch((error) => {
			console.log("error", error);
			setStatusText("Error approving transaction " + error.message);
			setSwapInProgress(false);
			setShowProgress(false);
			return null;
		});
	console.log("approveTxnHash", approveTxnHash);
	try{
		const explURL = skClient.getExplorerTxUrl({ chain: wallet.chain, txHash: approveTxnHash});
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
	setQuoteId,
	tokens,
	swapInProgress,
	quoteId,
	feeOption,
	currentTxnStatus,
	chainflipBroker
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
		const route =
			selectedRoute === "optimal" && routes.length > 0
				? routes.find(({ optimal }) => optimal) || routes[0]
				: routes.find((route) => route.providers.join(", ") === selectedRoute);
		if (!route) {
			setStatusText("No route selected");
			setSwapInProgress(false);
			setShowProgress(false);
			return;
		}
		if("CHAINFLIP" in route.providers){
			setStatusText("Chainflip not yet supported");
			return;
		}

		//ensure the right version of the token is used
		swapFrom = getTokenForProvider(
			tokens,
			swapFrom,
			route.providers[0]
		);

		console.log("route", route);
		setTxnHash("");
		setExplorerUrl("");
		setTxnStatus(null);
		setProgress(8);
		const { assetValue, otherBits } = await getAssetValue(swapFrom, amount);

		console.log("assetValue", assetValue, swapFrom, amount, otherBits);


		if (
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

			const allowance = await skClient.evm
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
		if(otherBits.decimalDifference > 0){
			route.sellAmount = parseFloat(route.sellAmount / 10 ** otherBits.decimalDifference) 
		}
		console.log("route.sellAmount", route.sellAmount);

		const swapParams = {
			route: route,
			streamSwap: route.streamingSwap ? true : false,
			feeOption: FeeOption[feeOption] || FeeOption.Average,
			recipient: destinationAddress,
		};

		console.log("swapParams", swapParams);

		if (route.providers[0] === "MAYACHAIN") swapParams.pluginName = "mayachain";

		const swapResponse = await skClient.swap(swapParams).catch((error) => {
			setStatusText("Error swapping:: " + error.message);
			setSwapInProgress(false);
			setShowProgress(false);
			return null;
		});

		if (!swapResponse) return;

		const walletChain = ChainIdToChain[wallet.chainId];
		const exURL = skClient.getExplorerTxUrl({
			chain: walletChain,
			txHash: swapResponse,
		});
		setExplorerUrl(exURL);

		console.log("exURL", exURL);
		// Function to log properties for debugging
		// Function to log properties for debugging
		function logObjectProperties(obj, name) {
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
				quoteId: quoteId,
				route: routeWithTransaction,
				feeOption: swapParams.feeOption,
				recipient: swapParams.recipient,
				pluginName: swapParams.pluginName,
			},
		};
		logObjectProperties(txDetailsToSend, "txDetailsToSend");
		setStatusText("Transaction Sent");

		// Send the transaction details
		const txDetails = await getTxnDetails(txDetailsToSend).catch((error) => {
			const txDetailsV2 = getTxnDetailsV2(swapResponse, route.sourceAddress).then((txDetailsV2) => {
				console.log("txDetailsV2", txDetailsV2);
				if (txDetailsV2) {
					txDetailsV2.done = false;
					txDetailsV2.lastCheckTime = 1;
				
					currentTxnStatus.current = txDetailsV2;
					return txDetailsV2;
				}
			}).catch((error) => {
				console.log("error", error);
				setStatusText("Cannot follow this tx. Check Navigator");
				setSwapInProgress(false);
				setShowProgress(false);
				return { done: true, status: "pending", lastCheckTime: 1 };
			}
			);
			return txDetailsV2;
		});
		console.log("txDetails", txDetails);

		if (txDetails?.done === true) {
			setStatusText("Transaction complete");
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
	routes,
	tokens
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
			routes,
			tokens
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
	routes,
	tokens
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
				if (fromToken) setSwapFrom(fromToken);
				break;
			case "token_to":
				const toToken = tokens.find(
					(token) =>
						token.identifier.toLowerCase() === value.trim().toLowerCase()
				);
				if (toToken) setSwapTo(toToken);
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
				if (routes && routes.length > 0) {
					setSelectedRoute(
						routes.findIndex(
							(route) => route.providers.join(", ") === value.trim()
						)
					);
				} else {
					setSelectedRoute("optimal");
				}
				break;
			default:
				break;
		}
	});
};
