import _ from "lodash";

const ADD_WINDOW = "ADD_WINDOW";

const addWindowAction = (newWindow) => ({
	type: ADD_WINDOW,
	payload: newWindow,
});

const MAXIMIZE_WINDOW = "MAXIMIZE_WINDOW";

const maximiseWindowAction = (window) => ({
	type: MAXIMIZE_WINDOW,
	payload: window,
});


const recursiveFindProgram = (programs, progName) => {

	console.log('recursiveFindProgram', programs, progName);

	for (let i = 0; i < programs.length; i++) {
		const p = programs[i];

		if (p.progName === progName || p.progName + ".exe" === progName) {
			if (p.openLevel === undefined) return p;
		}

		if (p.programs) {
			const nestedP = recursiveFindProgram(p.programs, progName);
			if (nestedP) {
				return nestedP;
			}
		}

	}
};


export function createNewWindow(
	programs,
	windowName,
	handleOpenArray,
	programData,
	highestZIndexRef,
	setHighestZIndex,
	dispatch,
	closeWindow,
	program,
	metadata = {},
	save = true,
	sendUpHash = () => {}
) {
	if (typeof program === "string") {
		const progString = program.toLowerCase();
		console.log(progString, programs);
		program = recursiveFindProgram(programs, progString);
		if (!program) {
			console.error("Program not found", progString);
			return;
		}
	} else {
		if (
			window.document.body.classList.contains("wait") &&
			window.waitingFor === program.progName
		) {
			console.log("Already waiting for a program to load");
			return;
		}
		window.document.body.classList.add("wait");
		window.document.body.style.cursor = "url(/waits.png), auto";
		//save a global 'waitingFor' variable

		console.log('Setting waiting for', program.progName);
		window.waitingFor = program.progName;

	}

	console.log("Creating new window", program.progName);
	// console.log("Opening window", program, metadata, save);

	if (!program) {
		console.error("Program not found or undefined", program);
		return;
	}

	if (program.openLevel !== undefined) {
		const level =
			program.openLevel < 0
				? handleOpenArray.length + program.openLevel
				: program.openLevel;
		if (level >= 0 && level < handleOpenArray?.length) {
			console.log(
				"Opening window in level",
				level,
				program.progName,
				programData
			);

			handleOpenArray[level](program.progName, metadata);
			return;
		}
	}

	if (highestZIndexRef.current === undefined) {
		setHighestZIndex(1);
		highestZIndexRef.current = 1;
	}

	console.log(
		"Opening window in " + windowName + " with program",
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
		programData: programData || metadata,
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
	console.log("dispatching add window action", newWindow);
	dispatch(addWindowAction(newWindow));
	console.log("Added window", newWindow);
	if(program.maximised){
		console.log('Maximising window', newWindow.id);
		dispatch(maximiseWindowAction(newWindow));	
	}

	//only do at top level... count handleOpenArray
	if (windowName === "desktop") {

		// Update the hash without causing a hashchange event
		const newHash = newWindow.progID === 0 ? "" : `#${newWindow.progName}`;
		sendUpHash(newHash);
	// }else{
		// console.log('Not setting hash', handleOpenArray);
	}
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
