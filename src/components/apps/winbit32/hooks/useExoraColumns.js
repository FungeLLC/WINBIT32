import { useMemo, useCallback } from "react";
import { RowNumber, HeaderCell, LetterCell } from "../styles/Exora";
import { FaEllipsisH } from "react-icons/fa";

export default function useExoraColumns({
	compactView,
	COLUMN_MAPPING,
	handleCellSelect,
	startEditing,
	selectedRow,
	selectedCell,
	getLetterForIndex,
	setSelectedRow,
	setSelectedCell,
	setCurrentTokenSetter,
	updateCell,
	setIsTokenDialogOpen,
	wallets,
	formatTokenBalance,
}) {
	const getVisibleColumns = useCallback(() => {
		const numberCol = {
			name: (
				<>
					<RowNumber style={{ zIndex: 1, marginTop: 0 }}>#</RowNumber>
					<RowNumber style={{ zIndex: 2, marginTop: "1px" }}>1</RowNumber>
				</>
			),
			width: "30px",
			button: true,
			cell: (row, index) => (
				<RowNumber
					onClick={() => handleCellSelect(row)}
					style={{
						cursor: row.isEmpty ? "default" : "pointer",
						textAlign: "center",
						userSelect: "none",
						background: "#c3cbcb",
						border:
							selectedRow?.swapid === row.swapid
								? "2px inset #e6f3ff"
								: "2px outset #989e9e",
					}}>
					{index + 2}
				</RowNumber>
			),
		};

		const statusColumn = {
			name: (
				<HeaderCell>
					<LetterCell>{getLetterForIndex(0)}</LetterCell>
					<div>{COLUMN_MAPPING.status.title}</div>
				</HeaderCell>
			),
			selector: (row) => row.status,
			width: "40px",
			cell: (row) => {
				const status = COLUMN_MAPPING.status.format(null, row);
				return (
					<div
						style={{
							width: "12px",
							height: "12px",
							borderRadius: "50%",
							backgroundColor: status.color,
							margin: "auto",
							// Add blinking animation for low balance warning
							animation: status.blink ? "blink 2s infinite" : "none",
						}}
						title={status.tooltip}
					/>
				);
			},
		};


		const dataColumns = Object.entries(COLUMN_MAPPING)
			.filter(
				([field, mapping]) =>
					field !== "status" && (!compactView || mapping.compact)
			)
			.map(([field, mapping], idx) => {
				if (mapping.title === "Routes") {
					return  {
			name: (
				<HeaderCell>
					<LetterCell>{getLetterForIndex(idx + 1)}</LetterCell>
					<div>Routes</div>
				</HeaderCell>
			),
			selector: (row) => row.routes,
			editor: "select",
			cell: (row) => (
				<div
					className={"cell_inner editor_select cell_routes_" + row?.swapid}
					onClick={() => handleCellSelect(row, "routes")}
					onDoubleClick={() => {
						handleCellSelect(row, "routes");
						startEditing(row, "routes");
					}}
					style={{
						cursor: row.isEmpty ? "default" : "pointer",
						padding: "4px",
						display: "flex",
						flexDirection: "column",
						gap: "2px",
					}}>
					{row.status === "Quoting..." ? (
						<span style={{ color: "#666", fontStyle: "italic" }}>
							Getting quotes...
						</span>
					) : row.selectedRoute ? (
						<>
							<div>{row.selectedRoute}</div>
							{row.route && (
								<div style={{ fontSize: "0.8em", color: "#666" }}>
									{row.route.expectedBuyAmount} {row.toToken?.symbol}
								</div>
							)}
						</>
					) : row.routes && row.routes.length > 0 ? (
						"Select Route"
					) : (
						""
					)}
				</div>
			),
		};
				} else {
					return {
						name: (
							<HeaderCell>
								<LetterCell>{getLetterForIndex(idx + 1)}</LetterCell>
								<div>{mapping.title}</div>
							</HeaderCell>
						),
						selector: (row) => row[field],
						cell: (row) => {
							const isSelected =
								selectedRow?.swapid === row.swapid && selectedCell === field;

							// Add key to force re-render when row is updated
							const key = `${row.swapid}_${field}_${row.updateKey || ""}`;

							// Update display logic for balance fields
							if (field === 'currentInBalance') {
								return formatTokenBalance(row.fromToken, wallets);
							}
							if (field === 'currentOutBalance') {
								return formatTokenBalance(row.toToken, wallets);
							}
							if (field === 'gasBalance') {
								return formatTokenBalance(row.gasAsset, wallets);
							}

							return (
								<div
									key={key}
									className={`cell_inner editor_${mapping.editor} cell_${field}_${row?.swapid}`}
									onClick={(e) => {
										e.stopPropagation();
										handleCellSelect(row, field);
									}}
									onDoubleClick={(e) => {
										e.stopPropagation();
										handleCellSelect(row, field);
										startEditing(row, field, true);
									}}
									style={{
										cursor: row.isEmpty ? "default" : "pointer",
										padding: "4px",
										border: isSelected ? "1px solid #000" : "none",
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
									}}>
									{mapping.editor === "tokenSelect" ? (
										<>
											{row[field] ? (
												<span style={{ display: "flex", alignItems: "center" }}>
													<img
														src={row[field].logoURI}
														alt={row[field].name}
														style={{
															width: "20px",
															height: "20px",
															marginRight: "5px",
														}}
													/>
													<span>
														<b>{row[field].ticker}</b> {row[field].name} on{" "}
														{row[field].chain}
														{row[field]?.ticker?.includes("/")
															? " (Synthetic)"
															: ""}
													</span>
												</span>
											) : (
												<span></span>
											)}
										</>
									) : (
										<span>
											{mapping.format
												? mapping.format(row[field], row)
												: row[field]}
										</span>
									)}
									{mapping.editor === "tokenSelect" && !row.isEmpty && (
										<FaEllipsisH
											style={{
												opacity: 0.5,
												marginLeft: "4px",
												cursor: "pointer",
											}}
											onClick={(e) => {
												e.stopPropagation();
												setSelectedRow(row);
												setSelectedCell(field);
												setCurrentTokenSetter(
													() => (token) => updateCell(row, field, token)
												);
												setIsTokenDialogOpen(true);
											}}
										/>
									)}
								</div>
							);
						},
					};
				}
			});

		return [numberCol, statusColumn, ...dataColumns];
	}, [
		compactView,
		selectedRow?.swapid, // Only depend on ID
		selectedCell,
		handleCellSelect,
		startEditing,
		getLetterForIndex,
		wallets,
	]);

	return useMemo(() => getVisibleColumns(), [getVisibleColumns]);
}
