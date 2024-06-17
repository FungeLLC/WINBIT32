import _ from "lodash";

const ADD_WINDOW = "ADD_WINDOW";

const addWindowAction = (newWindow) => ({
	type: ADD_WINDOW,
	payload: newWindow,
});

export function createNewWindow(
	programs,
	handleOpenArray,
	programData,
	highestZIndexRef,
	setHighestZIndex,
	dispatch,
	closeWindow,
	program,
	metadata = {},
	save = true
) {
	console.log("Creating new window", program.progName);
	console.log("Opening window", program, metadata, save);

	if (typeof program === "string") {
		program = programs.find((p) => p.progName === program);
	}

	if (!program) {
		console.error("Program not found or undefined", program);
		return;
	}

	if (program.openLevel !== undefined) {
		const level =
			program.openLevel < 0
				? handleOpenArray.length + program.openLevel
				: program.openLevel;
		if (level >= 0 && level < handleOpenArray.length) {
			handleOpenArray[level](program.progName, programData);
			return;
		}
	}

	if (highestZIndexRef.current === undefined) {
		setHighestZIndex(1);
		highestZIndexRef.current = 1;
	}

	if (window.document.body.classList.contains("wait")) {
		return;
	}
	window.document.body.classList.add("wait");
	window.document.body.style.cursor = "url(/waits.png), auto";

	console.log(
		"Opening window in " + program.progName,
		program,
		highestZIndexRef.current
	);

	const deepCopy = _.cloneDeep(program);

	const newZIndex = highestZIndexRef.current + 1;
	const windowId = Math.random().toString(36).substring(7);
	const newWindow = {
		id: windowId,
		zIndex: newZIndex,
		windowId: windowId,
		metadata: metadata,
		close: () => closeWindow({ windowId: windowId }),
		...deepCopy,
	};

	console.log(
		"New window to be added with zIndex",
		newZIndex,
		highestZIndexRef.current,
		newWindow
	);

	setHighestZIndex(newZIndex);
	highestZIndexRef.current = newZIndex;

	dispatch(addWindowAction(newWindow));
}



const convertToFunction = (input, functionMap) => {
	if (typeof input === "string" && input.startsWith("!!")) {
		const functionName = input.slice(2); // Remove "!!" prefix
		// console.log(`Converting ${input} to function in window ${windowName}`);
		return functionMap[functionName]; // Return the function reference
	}
	return input; // Return the original input if not a special case
};

export function convertObjectFunctions(obj, functionMap) {
	// Base case: if the object is not really an object (or is null), return it unchanged
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	// Iterate over each key in the object
	Object.keys(obj).forEach((key) => {
		const value = obj[key];

		// If the value is a string and it matches a key in the functionMap, convert it
		if (typeof value === "string" && value.startsWith("!!")) {
			// console.log('converting', value);

			if (key.startsWith("_")) {
				key = key.slice(1);
			}

			obj[key] = convertToFunction(value, functionMap);
		} else if (typeof value === "object") {
			// If the value is an object, recursively process it
			convertObjectFunctions(value, functionMap);
		}
	});

	return obj;
}
