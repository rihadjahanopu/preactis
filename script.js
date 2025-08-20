// --- Main Application Logic (script.js) ---

import { startScan, writeMultiDemo, writeNfc } from "./nfc.js";
import { appendLog, setStatus, ui, updateScanUI } from "./ui.js";
import { hasWebNFC } from "./utils.js";

// Application State
const state = {
	controller: null,
};

// Theme Manager
function setupTheme() {
	const themeToggle = document.getElementById("theme-toggle");
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

	function applyTheme(theme) {
		document.documentElement.setAttribute("data-theme", theme);
		if (themeToggle) {
			themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
		}
	}

	// Set theme as early as possible
	const savedTheme = localStorage.getItem("theme");
	const initialTheme = savedTheme || (prefersDark.matches ? "dark" : "light");
	applyTheme(initialTheme);

	if (themeToggle) {
		themeToggle.addEventListener("click", () => {
			const currentTheme = document.documentElement.getAttribute("data-theme");
			const newTheme = currentTheme === "dark" ? "light" : "dark";
			localStorage.setItem("theme", newTheme);
			applyTheme(newTheme);
		});
	}
}

// Event Handlers
async function handleStartScan() {
	if (!hasWebNFC()) {
		setStatus("Web NFC not supported on this device/browser", "err");
		return;
	}
	updateScanUI(true);
	try {
		state.controller = new AbortController();
		await startScan(state.controller.signal, (message, serialNumber, tech) => {
			ui.serial.textContent = serialNumber || "—";
			ui.tech.textContent = tech || "NDEF";
			setStatus("Tag read ✔️", "ok");

			// message.records are already decoded by startScan
			const decoded = {
				serialNumber: serialNumber || null,
				records: message.records,
			};
			appendLog(decoded, "Tag Read");
		});
		setStatus("Scanning… bring a tag close 💡");
	} catch (err) {
		console.error(err);
		setStatus(err.message || "Scan failed", "err");
		updateScanUI(false);
	}
}

function handleStopScan() {
	if (state.controller) {
		state.controller.abort();
		state.controller = null;
	}
	updateScanUI(false);
	setStatus("Scan stopped");
}

async function handleWrite() {
	const type = ui.recordType.value;
	const payload = ui.payload.value ?? "";
	const mimeType = ui.mimeType.value.trim();

	if (type === "mime" && !mimeType) {
		setStatus("Please provide a MIME type for this record.", "warn");
		return;
	}

	try {
		const message = await writeNfc(type, payload, mimeType);
		setStatus("Write succeeded ✔️", "ok");
		appendLog(message, "Wrote Message");
	} catch (err) {
		console.error(err);
		setStatus(err.message || "Write failed", "err");
	}
}

async function handleMultiWrite() {
	try {
		const message = await writeMultiDemo();
		setStatus("Multi-record write ✔️", "ok");
		appendLog(message, "Wrote Multi-Record");
	} catch (err) {
		console.error(err);
		setStatus(err.message || "Write failed", "err");
	}
}

// Initializer
function init() {
	// UI Bindings
	ui.btnStart.addEventListener("click", handleStartScan);
	ui.btnStop.addEventListener("click", handleStopScan);
	ui.btnWrite.addEventListener("click", handleWrite);
	ui.btnWriteMulti.addEventListener("click", handleMultiWrite);

	ui.recordType.addEventListener("change", () => {
		ui.mimeType.classList.toggle("hidden", ui.recordType.value !== "mime");
	});

	// Support Check
	if (hasWebNFC()) {
		ui.support.textContent = "Web NFC supported ✔️";
		ui.support.style.color = "var(--ok)";
	} else {
		ui.support.textContent = "Web NFC not supported";
		ui.support.style.color = "var(--err)";
		ui.btnStart.disabled = true;
		ui.btnWrite.disabled = true;
		ui.btnWriteMulti.disabled = true;
	}

	// setupTheme is now called only once, after DOM is ready

	// Cleanup on unload
	window.addEventListener("pagehide", handleStopScan);
}

// Ensure DOM is loaded before initializing

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => {
		setupTheme();
		init();
	});
} else {
	setupTheme();
	init();
}

// --- UI Module (ui.js) ---
export const ui = {
	btnStart: document.getElementById("btnStart"),
	btnStop: document.getElementById("btnStop"),
	btnWrite: document.getElementById("btnWrite"),
	btnWriteMulti: document.getElementById("btnWriteMulti"),
	support: document.getElementById("support"),
	status: document.getElementById("status"),
	serial: document.getElementById("serial"),
	tech: document.getElementById("tech"),
	log: document.getElementById("log"),
	recordType: document.getElementById("recordType"),
	payload: document.getElementById("payload"),
	mimeType: document.getElementById("mimeType"),
	scannerAnimation: document.querySelector(".scanner-animation"),
};

export function setStatus(text, tone = "info") {
	ui.status.textContent = text;
	ui.status.style.color = `var(--${tone === "info" ? "text" : tone})`;
}

export function appendLog(obj, heading) {
	const card = document.createElement("div");
	card.className = "card";
	card.style.background = "var(--code-bg)";
	card.innerHTML = `
    <div class="row" style="justify-content:space-between; margin-bottom:8px">
      <div class="pill">${heading}</div>
      <div class="muted" style="font-size:12px">${new Date().toLocaleString()}</div>
    </div>
    <pre>${escapeHtml(JSON.stringify(obj, null, 2))}</pre>
  `;
	ui.log.prepend(card);
}

export function updateScanUI(isScanning) {
	ui.btnStart.disabled = isScanning;
	ui.btnStop.disabled = !isScanning;
	ui.scannerAnimation.classList.toggle("hidden", !isScanning);
}

function escapeHtml(str) {
	return str.replace(
		/[&<>'"]/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"'": "&#39;",
				'"': "&quot;",
			}[c])
	);
}

// --- NFC Module (nfc.js) ---
import { dataViewToHex, decodeRecord } from "./utils.js";

export async function startScan(signal, onReading) {
	const ndef = new NDEFReader();
	await ndef.scan({ signal });

	ndef.onreadingerror = () => {
		console.log("Cannot read data from the NFC tag. Try another one?");
	};

	ndef.onreading = (event) => {
		const { message, serialNumber } = event;
		const decodedRecords = message.records.map(decodeRecord);
		onReading(
			{ ...message, records: decodedRecords },
			serialNumber,
			event.target?.tech
		);
	};
}

export function stopScan(controller) {
	if (controller) {
		controller.abort();
	}
}

export async function writeNfc(recordType, payload, mimeType = null) {
	const writer = new NDEFReader();
	let message;

	if (recordType === "mime") {
		const bytes = new TextEncoder().encode(payload);
		message = {
			records: [{ recordType: "mime", mediaType: mimeType, data: bytes }],
		};
	} else if (recordType === "unknown") {
		const bytes = new TextEncoder().encode(payload);
		message = { records: [{ recordType, data: bytes }] };
	} else {
		message = { records: [{ recordType, data: payload }] };
	}

	await writer.write(message);
	return message; // Return message for logging
}

export async function writeMultiDemo() {
	const writer = new NDEFReader();
	const message = {
		records: [
			{ recordType: "text", data: "Hello from Web NFC 👋" },
			{
				recordType: "url",
				data: "https://developer.mozilla.org/docs/Web/API/Web_NFC_API",
			},
			{
				recordType: "mime",
				mediaType: "text/plain",
				data: new TextEncoder().encode("sample mime payload"),
			},
		],
	};
	await writer.write(message);
	return message;
}

// --- Utilities Module (utils.js) ---
export function hasWebNFC() {
	return "NDEFReader" in window;
}

export function dataViewToHex(view) {
	return Array.from({ length: view.byteLength }, (_, i) =>
		view.getUint8(i).toString(16).padStart(2, "0")
	)
		.join(":")
		.toUpperCase();
}

export function decodeRecord(record) {
	let payload;
	const decoder = new TextDecoder();

	if (record.data) {
		try {
			// Attempt to decode as text first for known text-based types
			if (
				record.recordType === "text" ||
				record.recordType === "url" ||
				(record.mediaType && record.mediaType.startsWith("text/"))
			) {
				payload = decoder.decode(record.data);
			} else {
				// For other types, show hex representation
				payload = `[Hex] ${dataViewToHex(record.data)}`;
			}
		} catch {
			// Fallback for any decoding error
			payload = `[Binary Data: ${record.data.byteLength} bytes]`;
		}
	}

	return {
		recordType: record.recordType,
		mediaType: record.mediaType || null,
		id: record.id || null,
		payload,
	};
}
