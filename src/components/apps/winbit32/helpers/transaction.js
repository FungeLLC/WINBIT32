import { RequestClient } from "@swapkit/helpers";
import { ChainToExplorerUrl, Chain } from "@swapkit/sdk";
import bigInt from "big-integer";

const baseUrlV1 = "https://api.thorswap.net";

export const formatNumber = (number, precision = 8) => {
	if(!number && number !== 0) return false;
	if (number < 1) {
		return number.toFixed(precision);
	} else if (number < 10) {
		return number.toFixed(2);
	} else if (number < 100) {
		return number.toFixed(3);
	} else if (number < 1000) {
		return number.toFixed(2);
	}
	return Math.floor(number);
};


export const formatBalance = (bigIntValue, decimals, precision = 8) => {
	const factor = bigInt(10).pow(decimals);
	const integerPart = bigIntValue.divide(factor);
	const fractionalPart = bigIntValue.mod(factor).toJSNumber() / factor.toJSNumber();
	const balance = integerPart.toJSNumber() + fractionalPart;

	return formatNumber(balance, precision);
};



export function getExplorerAddressUrl(
	chain,
	address,
) {
	const baseUrl = ChainToExplorerUrl[chain];

	switch (chain) {
		case Chain.Solana:
			return `${baseUrl}/account/${address}`;

		default:
			return `${baseUrl}/address/${address}`;
	}
}
//https://api.thorswap.net/tracker/v2/txn

export function getTxnDetails(txHash) {
	console.log("getTxnDetails", txHash);
	return RequestClient.post(`${baseUrlV1}/tracker/v2/txn`, {
		body: JSON.stringify(txHash),
		headers: {
			"Content-Type": "application/json",
		},
	});
}

export function getTxnDetailsV2(txHash, from) {
	console.log("getTxnDetails", txHash);
	//https://api.thorswap.net/tracker/txn?txid=B0E4F485F65F0771DABE3004B30E8CDD5AF85639745DEF6C7737F92D1527D044&from=thor1wjr2az7ccjvyvuuw3mp9j60vx0rcazyzy2mqs7&type=SWAP%3ATC-TC
	return RequestClient.get(`${baseUrlV1}/tracker/txn?txid=${txHash}&from=${from}&type=SWAP%3ATC-TC`);
}


export const checkTxnStatus = async (
	txnHash,
	_txnHash,
	cnt,
	swapInProgress,
	txnStatus,
	setStatusText,
	setSwapInProgress,
	setShowProgress,
	setProgress,
	setTxnStatus,
	setTxnTimer,
	txnTimerRef
) => {
	console.log(
		"checkTxnStatus",
		txnHash,
		_txnHash,
		cnt,
		swapInProgress,
		txnStatus,
		txnStatus?.lastCheckTime,
		new Date() - txnStatus?.lastCheckTime > 1000
	);
	if (
		swapInProgress &&
		txnHash &&
		txnHash !== "" &&
		txnHash === _txnHash &&
		txnStatus?.done !== true &&
		txnStatus?.lastCheckTime &&
		new Date() - txnStatus?.lastCheckTime > 1000 &&
		cnt < 100
	) {
		console.log("Getting txn details", txnHash.toString());
		
		const status = await getTxnDetails({ hash: txnHash.toString() }).catch(
			(error) => {
				//setStatusText("Error getting transaction details");
				setSwapInProgress(false);
				setShowProgress(false);
				return null;
			}
		);
		if (!status) {
			console.log("no status", status);
			setTxnTimer(
				setTimeout(() => {
					checkTxnStatus(
						txnHash,
						txnHash + "",
						cnt + 1,
						swapInProgress,
						txnStatus,
						setStatusText,
						setSwapInProgress,
						setShowProgress,
						setProgress,
						setTxnStatus,
						setTxnTimer,
						txnTimerRef
					);
				}, 30000)
			);
			return;
		}
		status.lastCheckTime = new Date();
		setTxnStatus(status);
		console.log("status", status);
		if (status?.done === false && status?.result?.legs?.length > 0) {
			setProgress((prev) => (prev < 95 ? prev + 1 : 95));
			const delay =
				((status.result.legs.slice(-1).estimatedEndTimestamp -
					status.result.startTimestamp) /
					80) *
					1000 || 10000;
			if (!cnt) cnt = 0;

			if (txnTimerRef.current) clearTimeout(txnTimerRef.current);

			setTxnTimer(
				setTimeout(() => {
					checkTxnStatus(
						txnHash,
						txnHash + "",
						cnt + 1,
						swapInProgress,
						txnStatus,
						setStatusText,
						setSwapInProgress,
						setShowProgress,
						setProgress,
						setTxnStatus,
						setTxnTimer,
						txnTimerRef
					);
				}, delay)
			);
		} else if (status?.done === true) {
			setStatusText("Transaction complete");
			console.log("status done", status);
			setProgress(100);
			setSwapInProgress(false);
		}
	} else if (
		txnStatus?.done === true ||
		txnStatus?.error ||
		txnStatus?.txn?.route?.complete === true
	) {
		if (txnStatus?.error?.message) {
			setStatusText("Please follow the transaction on the link below");
		} else {
			setStatusText("Transaction complete");
		}
		console.log("status done2 ", txnStatus);
		setProgress(100);
		setSwapInProgress(false);
	}
};


export const getTxnUrl = (txHash, chain, skClient) => {
	try {
		if(txHash === null){
			return "";
		}
		switch (chain) {
			case Chain.THORChain:
			case Chain.Maya:
			case Chain.Bitcoin:
			case Chain.Ethereum:
				return `https://www.xscanner.org/tx/${txHash}`;

			case Chain.Solana:
				return 'https://solscan.io/tx/' + txHash;
			default:
				return skClient.getExplorerTxUrl({ chain, txHash });
		}
	} catch (error) {
		console.log("error", error, txHash, chain, skClient);
		if (chain === "XRD" || chain === 'radix-mainnet') {
			if (txHash?.id)
				return `https://dashboard.radixdlt.com/transaction/${txHash?.id}`;
			else return `https://dashboard.radixdlt.com/transaction/${txHash}`;
		} else {
			return "https://www.mayascan.org/tx/" + txHash;
		}
	}
}
