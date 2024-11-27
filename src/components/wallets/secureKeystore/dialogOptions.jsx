
export const addDialogOptions = (options) => {
	console.log("addDialogOptions", options);
	const advancedContent = 
			<>
				<div className="dialog-field">
					<label>Derivation Index:</label>
					<select name="dIndex">
						<option value="0" selected>
							0
						</option>
						<option value="1">1</option>
						<option value="2">2</option>
						<option value="3">3</option>
						<option value="4">4</option>
						<option value="5">5</option>
						<option value="6">6</option>
						<option value="7">7</option>
						<option value="8">8</option>
						<option value="9">9</option>
					</select>
				</div>
				<div className="dialog-field">
					<label>Radix Network:</label>
					<select name="networkOptions.radixNetwork">
						<option value="legacy">Swapkit Legacy</option>
						<option value="olympia">Olympia (Radix Legacy)</option>
						<option value="mainnet" selected>
							Mainnet (Babylon)
						</option>
					</select>
				</div>
			</>
		;
	if (options.advancedContent){
		options.advancedContent = options.advancedContent + advancedContent;
	}else{
		options.advancedContent = advancedContent;
	}
	console.log("addDialogOptions", options);
	return options;
}

		