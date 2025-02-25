import React, { useCallback } from "react";
import { chooseWalletForToken } from "../helpers/handlers";
import { getQuotes } from "../helpers/quotes";

export default function useExoraActions({
	rows,
	setRows,
	skClient,
	wallets,
	tokens,
	chainflipBroker,
	onOpenWindow,
	handleSwap, // Add handleSwap to destructured props
}) {
	const handleQuote = useCallback(
		async (row) => {
			// Get fresh row data before starting quote
			const currentRow = rows.find((r) => r.swapid === row.swapid);
			if (!currentRow) return;

			setRows((current) =>
				current.map((r) =>
					r.swapid === currentRow.swapid ? { ...r, routes: [] } : r
				)
			);

			// Use currentRow instead of passed row for the rest of the function
			if (!currentRow.fromToken || !currentRow.toToken || !currentRow.amountIn) {
				setRows((current) =>
					current.map((r) =>
						r.swapid === currentRow?.swapid
							? { ...r, status: "Please select tokens and enter amount" }
							: r
					)
				);
				return;
			}

			const wallet = chooseWalletForToken(currentRow.fromToken, wallets);

			if (!wallet) {
				setRows((current) =>
					current.map((r) =>
						r.swapid === currentRow.swapid
							? { ...r, status: "No wallet available for selected token" }
							: r
					)
				);
				return;
			}

			setRows((current) =>
				current.map((r) =>
					r.swapid === currentRow.swapid ? { ...r, status: "Quoting..." } : r
				)
			);

			const destination =
				currentRow.destinationAddress?.trim() || wallet.address;

			try {
				// Ensure streaming parameters are properly formatted for the quote
				const streamingInterval = currentRow.streamingInterval || undefined;
				const streamingNumSwaps = currentRow.streamingNumSwaps || undefined;

				// Only pass streaming parameters if they're actually set
				const streamingParams =
					streamingInterval || streamingNumSwaps
						? {
								streamingInterval,
								streamingNumSwaps,
						  }
						: {};

				const routes = await getQuotes(
					currentRow.fromToken,
					currentRow.toToken,
					parseFloat(currentRow.amountIn),
					destination,
					currentRow.slippage || 1,
					(text) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid ? { ...r, status: text } : r
							)
						),
					(quoteStatus) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid ? { ...r, quoteStatus } : r
							)
						),
					(routes) => {
						if (routes && routes.length > 0) {
							let bestRoute =
								routes.find((route) => route.optimal) ||
								routes.reduce(
									(max, route) =>
										route.expectedBuyAmount > max.expectedBuyAmount
											? route
											: max,
									routes[0]
								);

							bestRoute.optimal = true;
							let routeName = "optimal";

							if (
								currentRow.selectedRoute !== "optimal " &&
								routes.find((route) =>
									route.providers.includes(currentRow.route)
								)
							) {
								bestRoute = routes.find((route) =>
									route.providers.includes(currentRow.route)
								);
								routeName = currentRow.route;
							}

							setRows((current) => {
								// Find current row index
								const currentIndex = current.findIndex(
									(r) => r.swapid === currentRow.swapid
								);
								const updatedRows = [...current];

								// Update current row with quote results
								updatedRows[currentIndex] = {
									...current[currentIndex],
									routes,
									selectedRoute: routeName,
									route: bestRoute,
									expectedOut: bestRoute.expectedBuyAmount,
									status: "Quote Ready",
									streamingInterval: bestRoute.streamingBlocks,
									streamingNumSwaps: bestRoute.streamingQuantity,
								};

								// After quote is received, handle chain fill
								const nextRow = updatedRows[currentIndex + 1];
								if (nextRow) {
									if (nextRow.isEmpty) {
										// Insert new row with output values
										updatedRows[currentIndex + 1] = {
											...initialRowState,
											swapid: Date.now(),
											iniData: `token_from=${currentRow.toToken?.identifier}\namount=${bestRoute.expectedBuyAmount}`,
											fromToken: currentRow.toToken,
											amountIn: bestRoute.expectedBuyAmount,
											status: "New",
										};
									} else if (
										nextRow.fromToken?.identifier ===
										currentRow.toToken?.identifier
									) {
										// Update existing row amount
										updatedRows[currentIndex + 1] = {
											...nextRow,
											iniData: nextRow.iniData.replace(
												/amount=.*/,
												`amount=${bestRoute.expectedBuyAmount}`
											),
											amountIn: bestRoute.expectedBuyAmount,
										};
									}
								} else {
									updatedRows.push({
										...initialRowState,
										swapid: Date.now(),
										iniData: `token_from=${currentRow.toToken?.identifier}\namount=${bestRoute.expectedBuyAmount}`,
										fromToken: currentRow.toToken,
										amountIn: bestRoute.expectedBuyAmount,
										status: "New",
									});
								}

								return updatedRows;
							});
						} else {
							setRows((current) => {
								return current.map((r) =>
									r.swapid === currentRow.swapid
										? {
												...r,
												status: "No routes available",
												route: "",
												routes: [],
										  }
										: r
								);
							});
						}
					},
					() => wallet,
					tokens,
					(address) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid
									? { ...r, destinationAddress: address }
									: r
							)
						),
					(route) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid
									? { ...r, selectedRoute: route }
									: r
							)
						),
					wallets,
					currentRow.selectedRoute || "optimal",
					currentRow.license !== false,
					null,
					currentRow.iniData || "",
					currentRow.thorAffiliate || "be",
					currentRow.mayaAffiliate || "be",
					(affiliate) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid
									? { ...r, thorAffiliate: affiliate }
									: r
							)
						),
					(affiliate) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid
									? { ...r, mayaAffiliate: affiliate }
									: r
							)
						),
					(quoteData) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === currentRow.swapid
									? {
											...r,
											reportData: {
												...r.reportData,
												quotes: quoteData,
												quoteTime: new Date().toISOString(),
											},
									  }
									: r
							)
						),
					...Object.values(streamingParams), // Spread streaming parameters
					currentRow.streamingNumSwaps, // Add this
					currentRow.streamingInterval // Add this
				);

				if (!routes || routes.length === 0) {
					setRows((current) =>
						current.map((r) =>
							r.swapid === currentRow.swapid
								? { ...r, status: "No routes available" }
								: r
						)
					);
				}
			} catch (error) {
				console.error("Error quoting:", error);
				setRows((current) =>
					current.map((r) =>
						r.swapid === currentRow.swapid
							? {
									...r,
									status: `Error: ${error.message}`,
									reportData: {
										...r.reportData,
										quoteError: error.message,
										errorTime: new Date().toISOString(),
									},
							  }
							: r
					)
				);
			}
		},
		[rows, wallets, tokens]
	);

	const handleExecute = useCallback(
		async (row) => {
			const updatedRow = { ...row, locked: true, swapInProgress: true };
			setRows((prevRows) =>
				prevRows.map((r) => (r.swapid === row.swapid ? updatedRow : r))
			);

			try {
				// swapFrom,
				// swapTo,
				// amount,
				// destinationAddress,
				// routes,
				// selectedRoute,
				// slippage,
				// skClient,
				// wallets,
				// setStatusText,
				// setSwapInProgress,
				// setShowProgress,
				// setProgress,
				// setTxnHash,
				// setExplorerUrl,
				// setTxnStatus,
				// setTxnTimer,
				// tokens,
				// swapInProgress,
				// feeOption,
				// currentTxnStatus,
				// chainflipBroker,
				// isStreamingSwap,
				// streamingInterval,
				// streamingNumSwaps,
				// setReportData,
				// iniData,
				// license,
				// doSwap = true,
				// setRoutes,

				const swapResult = await handleSwap(
					// Now handleSwap should be defined
					row.fromToken,
					row.toToken,
					row.amountIn,
					row.destinationAddress,
					row.routes || [],
					row.selectedRoute,
					row.slippage || 1,
					skClient,
					wallets,
					(text) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, status: text } : r
							)
						),
					(inProgress) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid
									? { ...r, swapInProgress: inProgress }
									: r
							)
						),
					(show) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, showProgress: show } : r
							)
						),
					(prog) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, progress: prog } : r
							)
						),
					(hash) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, txnHash: hash } : r
							)
						),
					(url) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, explorerUrl: url } : r
							)
						),
					(status) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, txnStatus: status } : r
							)
						),
					(timer) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, txnTimer: timer } : r
							)
						),
					tokens,
					row.swapInProgress,
					row.feeOption || "Average",
					{ current: row.txnStatus },
					chainflipBroker,
					row.streamingSwap,
					row.streamingInterval,
					row.streamingNumSwaps,
					(reportData) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid
									? {
											...r,
											reportData: {
												...r.reportData,
												...reportData,
												executionTime: new Date().toISOString(),
											},
									  }
									: r
							)
						),
					row.iniData,
					row.license !== false,
					true,
					(route) =>
						setRows((current) =>
							current.map((r) =>
								r.swapid === row.swapid ? { ...r, selectedRoute: route } : r
							)
						)
				);

				if (swapResult) {
					setRows((prevRows) =>
						prevRows.map((r) =>
							r.swapid === row.swapid
								? {
										...r,
										swapInProgress: false,
										txIds: swapResult.txIds || [swapResult.txId],
								  }
								: r
						)
					);
				}
			} catch (err) {
				setRows((prevRows) =>
					prevRows.map((r) =>
						r.swapid === row.swapid
							? {
									...r,
									swapInProgress: false,
									status: `Error: ${err.message}`,
									reportData: {
										...r.reportData,
										error: err.message,
										errorTime: new Date().toISOString(),
									},
							  }
							: r
					)
				);
				console.error("Swap execution error:", err);
			}
		},
		[skClient, wallets, setRows, handleSwap]
	); // Add handleSwap to dependencies

	return {
		handleQuote,
		handleExecute,
	};
}
