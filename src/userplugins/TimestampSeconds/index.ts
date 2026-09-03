/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    showRelativeTime: {
        type: OptionType.BOOLEAN,
        description: "Append a relative time suffix (e.g. '5m ago') after the timestamp",
        default: false,
    },
    timeFormat: {
        type: OptionType.SELECT,
        description: "Time format to use for timestamps",
        options: [
            { label: "Auto-detect from system locale", value: "auto", default: true },
            { label: "12-hour  (e.g. 3:45:22 PM)", value: "12h" },
            { label: "24-hour  (e.g. 15:45:22)", value: "24h" },
        ],
    },
});

// ─── Formatting helpers ────────────────────────────────────────────────────────

function use24Hour(): boolean {
    const fmt = settings.store.timeFormat;
    if (fmt === "24h") return true;
    if (fmt === "12h") return false;
    return !new Date(Date.UTC(2020, 0, 1, 13, 0, 0))
        .toLocaleTimeString([], { hour: "2-digit" })
        .match(/AM|PM/i);
}

function formatWithSeconds(datetime: string): string {
    const d = new Date(datetime);
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ss = d.getSeconds().toString().padStart(2, "0");

    if (use24Hour()) {
        const hh = d.getHours().toString().padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }

    const h = d.getHours() % 12 || 12;
    const ampm = d.getHours() >= 12 ? "PM" : "AM";
    return `${h}:${mm}:${ss} ${ampm}`;
}

function relativeTime(datetime: string): string {
    const s = Math.floor((Date.now() - +new Date(datetime)) / 1000);
    if (s < 60)  return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)   return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w < 4)   return `${w}w ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
}

// Matches H:MM or H:MM:SS with optional AM/PM — with or without seconds
const TIME_RE = /\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?/i;

// ─── DOM patching ─────────────────────────────────────────────────────────────

function patchElement(el: HTMLTimeElement) {
    const dt = el.getAttribute("datetime");
    if (!dt) return;

    // Skip reply timestamps — ReplyTimestamp renders seconds natively via React,
    // so we must not touch them. Use .closest() rather than .classList.contains()
    // because Discord's Timestamp component may place the class on a wrapper
    // element that contains the <time>, not on the <time> element itself.
    if (el.closest(".vc-reply-timestamp")) return;

    const formatted = formatWithSeconds(dt);
    const suffix = settings.store.showRelativeTime ? ` (${relativeTime(dt)})` : "";
    const isHoverStamp = !!el.closest('[class*="timestampVisibleOnHover"]');

    // Patch at the text-node level rather than via el.textContent.
    //
    // Setting el.textContent replaces ALL child nodes with a single text node,
    // which destroys any child elements Discord has rendered inside <time> —
    // most importantly the <i class="separator"> element that carries the " — "
    // em-dash before compact-mode timestamps. Destroying it turns the dash into
    // a plain text character whose layout and styling differ from the original,
    // producing the spurious "  —" prefix and causing reply message text to
    // clip out of its bounding box.
    //
    // Instead, we walk the text nodes inside <time> with a TreeWalker, find the
    // one that actually contains the time string, and update only that node.
    // All element children (separators, etc.) are left completely untouched.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
        const textNode = node as Text;
        const text = textNode.textContent ?? "";
        if (!TIME_RE.test(text)) continue;

        // Strip any relative-time suffix we appended in a previous tick so
        // that the base string is always the clean Discord-formatted label.
        const base = text.replace(/\s*\(.*?\)\s*$/, "");

        const newText = isHoverStamp
            ? formatted                              // hover stamps: just the time
            : base.replace(TIME_RE, formatted) + suffix; // normal: preserve prefix ("Today at …")

        if (textNode.textContent !== newText) {
            textNode.textContent = newText;
            // Keep the accessible label in sync with the new full text content.
            el.setAttribute("aria-label", el.textContent ?? "");
        }
        // Only the first matching text node needs patching.
        break;
    }
}

function updateAll() {
    for (const el of document.querySelectorAll<HTMLTimeElement>("time[datetime]")) {
        patchElement(el);
    }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let observer: MutationObserver | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

export default definePlugin({
    name: "TimestampSeconds",
    description: "Shows seconds in message timestamps (e.g. 3:45:22 PM). Optionally appends relative time.",
    authors: [
        {
            // Replace 0n with your real Discord user ID (as a BigInt) if publishing.
            name: "Echo",
            id: 0n,
        },
    ],
    settings,

    start() {
        updateAll();

        observer = new MutationObserver(muts => {
            for (const mut of muts) {
                if (mut.type !== "childList") continue;
                for (const node of mut.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node instanceof HTMLTimeElement && node.hasAttribute("datetime")) {
                        patchElement(node);
                    }
                    for (const child of node.querySelectorAll<HTMLTimeElement>("time[datetime]")) {
                        patchElement(child);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        ticker = setInterval(updateAll, 1000);
    },

    stop() {
        observer?.disconnect();
        observer = null;

        if (ticker !== null) {
            clearInterval(ticker);
            ticker = null;
        }
    },
});
