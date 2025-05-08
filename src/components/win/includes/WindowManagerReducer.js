import { re } from "mathjs";

export const initialState = {
	windows: [],
	minimizedWindows: [],
	contextMenuVisible: false,
	contextMenuPosition: { x: 0, y: 0 },
	highestZIndex: 1,
	windowHistory: [],
	programList: [],
	programs: [],
	closedWindows: [], // Track closed windows
};

export const reducer = (state, action) => {
	if (!action || !action.type) {
		console.error("Invalid action dispatched:", action);
		return state;
	}

	switch (action.type) {
		case "SET_WINDOWNAME":
			return {
				...state,
				windowName: action.payload,
			};
		case "SET_WINDOWID":
			return {
				...state,
				windowId: action.payload,
			};
		case "SET_WINDOWS":
			return {
				...state,
				windows: Array.isArray(action.payload) ? action.payload : [],
			};
		case "SET_MINIMIZED_WINDOWS":
			return {
				...state,
				minimizedWindows: Array.isArray(action.payload) ? action.payload : [],
			};
		case "SET_CONTEXT_MENU_VISIBLE":
			return { ...state, contextMenuVisible: action.payload };
		case "SET_CONTEXT_MENU_POSITION":
			return { ...state, contextMenuPosition: action.payload };
		case "SET_HIGHEST_Z_INDEX":
			return { ...state, highestZIndex: action.payload };
		case "SET_WINDOW_HISTORY":
			return {
				...state,
				windowHistory: Array.isArray(action.payload) ? action.payload : [],
			};
		case "SET_PROGRAM_LIST":
			return {
				...state,
				programList: Array.isArray(action.payload) ? action.payload : [],
			};
		case "SET_PROGRAMS":
			return {
				...state,
				programs: Array.isArray(action.payload) ? action.payload : [],
			};
		case "ADD_WINDOW":
			if (action.payload.minimized) {
				return {
					...state,
					windows: [
						...state.windows,
						action.payload,
					],
					minimizedWindows: [...state.minimizedWindows, action.payload],
				};
			}
			return { ...state, windows: [...state.windows, action.payload] };
		case "MINIMIZE_WINDOW":
			return {
				...state,
				minimizedWindows: [...state.minimizedWindows, action.payload],
				windows: state.windows.map((w) =>
					w.windowId === action.payload.windowId
						? { ...w, minimized: true, zIndex: 0 }
						: w
				),
			};
		case "RESTORE_WINDOW":
			return {
				...state,
				minimizedWindows: state.minimizedWindows.filter(
					(w) => w.windowId !== action.payload.windowId
				),
				windows: state.windows.map((w) =>
					w.windowId === action.payload.windowId
						? { ...w, minimized: false, maximized: false }
						: w
				),
				closedWindows: state.closedWindows.filter(
					(windowId) => windowId !== action.payload.windowId
				), // Remove from closed windows
			};
		case "MAXIMIZE_WINDOW":
			return {
				...state,
				windows: state.windows.map((w) => {
					if (w.windowId !== action.payload.windowId) {
						return { ...w, maximized: false };
					}
					return { ...w, maximized: true };
				}),
			};
		case "SET_CONTEXT_MENU":
			return {
				...state,
				contextMenuVisible: action.payload.contextMenuVisible,
				contextMenuPosition: action.payload.contextMenuPosition,
				contextWindowId: action.payload.contextWindowId,
			};
		case "SET_WINDOW_MENU":
			return {
				...state,
				windows: state.windows.map((w) =>
					w.windowId === action.payload.windowId
						? {
								...w,
								menu: action.payload.menu,
								menuHandler: action.payload.menuHandler,
						  }
						: w
				),
			};
		case "BRING_TO_FRONT":
			return {
				...state,
				windows: state.windows.map((w) =>
					w.windowId === action.payload.windowId
						? { ...w, zIndex: action.payload.newZIndex }
						: w
				),
				highestZIndex: action.payload.newZIndex,
				windowHistory: action.payload.windowHistory,
				hash: action.payload.hash,
			};
		case "OPEN_WINDOW":
			return {
				...state,
				windows: [...state.windows, action.payload.window],
				highestZIndex: state.highestZIndex + 1,
			};
		case "CLOSE_WINDOW":
			return {
				...state,
				windows: state.windows.filter((w) => w.windowId !== action.payload),
				closedWindows: [...state.closedWindows, action.payload], // Add to closed windows
				windowHistory: state.windowHistory.filter(
					(w) => w.windowId !== action.payload
				),
			};
		default:
			console.error("Unhandled action type:", action.type);
			return state;
	}
};
