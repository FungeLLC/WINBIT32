import React, { useCallback } from "react";
import { chooseWalletForToken } from "../helpers/handlers";
import { getQuotes } from "../helpers/quotes";
import { handleSwap } from "../helpers/handlers";
import { initialRowState } from "../helpers/constants";
import { handleExecuteAll, optimizeForGas } from "./handleExecuteAll";

export default function useExoraActions({
	rows,
	setRows,
	skClient,
	wallets,
	tokens,
	chainflipBroker,
	onOpenWindow,
	providers,
	refreshBalance,
	walletsRef
}) {
	const handleQuote = useCallback(
		async (row) => {
			console.log("handleQuote", row);

			//if row has tx data, return
			if (row.txIds?.length > 0) {
				return;
			}

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
					() => {},
					() => {},
					streamingParams.streamingNumSwaps || 0,
					streamingParams.streamingInterval || 0,
					providers
				);
			} catch (error) {
				console.error("Error getting quotes:", error);
				setRows((current) =>
					current.map((r) =>
						r.swapid === currentRow.swapid
							? {
									...r,
									status: `Error: ${error.message || "Unknown error"}`,
							  }
							: r
					)
				);
			}
		},
		[rows, setRows, skClient, wallets, tokens, chainflipBroker]
	);

	// Add the handleExecute function
	const handleExecute = useCallback(
		async (row) => {
			if (!row?.swapid || row.isEmpty) return;
			
			// Get fresh row data
			const currentRow = rows.find((r) => r.swapid === row.swapid);
			if (!currentRow) return;
			
			// Check if we have all required data
			if (!currentRow.fromToken || !currentRow.toToken || !currentRow.amountIn || !currentRow.route) {
				setRows((current) => 
					current.map((r) => r.swapid === currentRow.swapid 
						? { ...r, status: "Missing required data for swap" } 
						: r
					)
				);
				return;
			}
			
			// Check if swap is already in progress
			if (currentRow.swapInProgress) {
				return;
			}
			
			// Update row status
			setRows((current) => 
				current.map((r) => r.swapid === currentRow.swapid 
					? { ...r, status: "Executing swap...", swapInProgress: true } 
					: r
				)
			);
			
			try {
				// Create report data object to store transaction details
				const reportData = {
					startTime: new Date().toISOString(),
					fromToken: currentRow.fromToken.identifier,
					toToken: currentRow.toToken.identifier,
					amountIn: currentRow.amountIn,
					expectedOut: currentRow.expectedOut,
					route: currentRow.selectedRoute,
					explorerUrls: [],
					txIds: []
				};
				
				// Update initial report data
				setRows((current) => 
					current.map((r) => r.swapid === currentRow.swapid 
						? { ...r, reportData: { ...r.reportData, ...reportData } } 
						: r
					)
				);
				
				// Call handleSwap to execute the transaction
				await handleSwap(
					currentRow.fromToken,
					currentRow.toToken,
					currentRow.amountIn,
					currentRow.destinationAddress || "",
					currentRow.routes || [],
					currentRow.selectedRoute || "optimal",
					currentRow.slippage || 1,
					skClient,
					wallets,
					// Status text updater
					(statusText) => setRows((current) => 
						current.map((r) => r.swapid === currentRow.swapid 
							? { ...r, status: statusText } 
							: r
						)
					),
					// Swap in progress updater
					(inProgress) => setRows((current) => 
						current.map((r) => r.swapid === currentRow.swapid 
							? { ...r, swapInProgress: inProgress } 
							: r
						)
					),
					// Show progress updater (not used in grid)
					() => {},
					// Progress updater
					(progress) => setRows((current) => 
						current.map((r) => r.swapid === currentRow.swapid 
							? { ...r, progress } 
							: r
						)
					),
					// Transaction hash updater
					(txHash) => {
						if (!txHash) return;
						setRows((current) => 
							current.map((r) => r.swapid === currentRow.swapid 
								? { 
										...r, 
										txIds: [...(r.txIds || []), txHash],
										reportData: {
											...r.reportData,
											txIds: [...(r.reportData?.txIds || []), txHash]
										}
									} 
								: r
							)
						);
					},
					// Explorer URL updater
					(explorerUrl) => {
						if (!explorerUrl) return;
						setRows((current) => 
							current.map((r) => r.swapid === currentRow.swapid 
								? { 
										...r, 
										explorerUrls: [...(r.explorerUrls || []), explorerUrl],
										reportData: {
											...r.reportData,
											explorerUrls: [...(r.reportData?.explorerUrls || []), explorerUrl]
										}
									} 
								: r
							)
						);
					},
					// Transaction status updater
					(txStatus) => setRows((current) => 
						current.map((r) => r.swapid === currentRow.swapid 
							? { 
									...r, 
									txStatus,
									reportData: {
										...r.reportData,
										txStatus,
										lastUpdateTime: new Date().toISOString()
									}  
								} 
							: r
						)
					),
					// Timer updater (not used in grid)
					() => {},
					tokens,
					false, // Start with swapInProgress = false
					currentRow.feeOption || "average",
					currentRow.txStatus,
					chainflipBroker,
					!!currentRow.streamingInterval || !!currentRow.streamingNumSwaps,
					currentRow.streamingInterval,
					currentRow.streamingNumSwaps,
					// Report data updater
					(additionalReportData) => {
						if (!additionalReportData) return;
						setRows((current) => 
							current.map((r) => r.swapid === currentRow.swapid 
								? { 
										...r, 
										reportData: { 
											...r.reportData, 
											...additionalReportData,
											endTime: new Date().toISOString() 
										} 
									} 
								: r
							)
						);
					},
					currentRow.iniData,
					currentRow.license !== false,
					true // doSwap = true to actually perform the swap
				);
				
				// // Final status update
				// setRows((current) => 
				// 	current.map((r) => r.swapid === currentRow.swapid 
				// 		? { 
				// 				...r, 
				// 				status: "Swap completed",
				// 				swapInProgress: false
				// 			} 
				// 		: r
				// 	)
				// );
				
				// Offer to view transaction report
				if (onOpenWindow && currentRow.reportData) {
					onOpenWindow("notepad.exe", {
						content: JSON.stringify(currentRow.reportData, null, 2),
						filename: `swap_report_${currentRow.swapid}.json`
					});
				}
				
			} catch (error) {
				console.error("Swap execution error:", error);
				setRows((current) => 
					current.map((r) => r.swapid === currentRow.swapid 
						? { 
								...r, 
								status: `Error: ${error.message || "Unknown error"}`,
								swapInProgress: false,
								reportData: {
									...r.reportData,
									error: error.message || "Unknown error",
									endTime: new Date().toISOString()
								}
							} 
						: r
					)
				);
			}
		},
		[rows, setRows, skClient, wallets, tokens, chainflipBroker, onOpenWindow]
	);

	// Wrap the imported handleExecuteAll function
	const executeAll = useCallback(
		async (inOrder = false) => {
			await handleExecuteAll(rows, setRows, skClient, handleExecute, onOpenWindow, inOrder, refreshBalance, walletsRef);
		},
		[rows, setRows, skClient, handleExecute, onOpenWindow]
	);
	
	// Wrap the optimizeForGas function
	const handleOptimizeForGas = useCallback(
		async () => {
			await optimizeForGas(rows, setRows, skClient, tokens, initialRowState, handleQuote);
		},
		[rows, setRows, skClient, tokens, handleQuote]
	);

	return { 
		handleQuote, 
		handleExecute, 
		handleExecuteAll: executeAll,
		handleOptimizeForGas
	};
}
