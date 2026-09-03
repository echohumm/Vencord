/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { DateUtils, Timestamp } from "@webpack/common";
import type { HTMLAttributes } from "react";

const MessageClasses = findCssClassesLazy("separator", "latin24CompactTimeStamp");

// Build the time portion ("HH:MM:SS" or "H:MM:SS AM/PM") from a native Date.
// Using getSeconds() on a plain Date — confirmed to work where moment .seconds() did not.
function formatTimeWithSeconds(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    
    return `${hh}:${mm}:${ss}`;
}

// Format a cross-day timestamp as "D/M/YYYY HH:MM:SS" to match Discord's
// compact date style rather than calendarFormat's verbose "28 March 2026 18:44".
function formatCrossDay(d: Date): string {
    const day   = d.getDate();
    const month = d.getMonth() + 1;
    const year  = d.getFullYear();
    return `${day}/${month}/${year} ${formatTimeWithSeconds(d)}`;
}

function formatTimestamp(refTimestamp: any, baseTimestamp: any): string {
    // refTimestamp is a moment-like object — convert to a plain Date via valueOf().
    const d = new Date(refTimestamp.valueOf());
    return DateUtils.isSameDay(refTimestamp, baseTimestamp)
        ? formatTimeWithSeconds(d)
        : formatCrossDay(d);
}

function Sep(props: HTMLAttributes<HTMLElement>) {
    return <i className={MessageClasses.separator} aria-hidden={true} {...props} />;
}

const enum ReferencedMessageState {
    LOADED = 0,
    NOT_LOADED = 1,
    DELETED = 2,
}

type ReferencedMessage = { state: ReferencedMessageState.LOADED; message: Message; } | { state: ReferencedMessageState.NOT_LOADED | ReferencedMessageState.DELETED; };

function ReplyTimestamp({
    referencedMessage,
    baseMessage,
}: {
    referencedMessage: ReferencedMessage,
    baseMessage: Message;
}) {
    if (referencedMessage.state !== ReferencedMessageState.LOADED) return null;
    const refTimestamp = referencedMessage.message.timestamp as any;
    const baseTimestamp = baseMessage.timestamp as any;
    return (
        <Timestamp
            className="vc-reply-timestamp"
            compact={false}
            timestamp={refTimestamp}
            isInline={false}
        >
            <Sep>[</Sep>
            {formatTimestamp(refTimestamp, baseTimestamp)}
            <Sep>]</Sep>
        </Timestamp>
    );
}

export default definePlugin({
    name: "ReplyTimestamp",
    description: "Shows a timestamp on replied-message previews",
    tags: ["Chat", "Appearance"],
    authors: [Devs.Kyuuhachi],

    patches: [
        {
            find: "#{intl::REPLY_QUOTE_MESSAGE_NOT_LOADED}",
            replacement: {
                match: /\.onClickReply,.+?}\),(?=\i,\i,\i\])/,
                replace: "$&$self.ReplyTimestamp(arguments[0]),"
            }
        }
    ],

    ReplyTimestamp: ErrorBoundary.wrap(ReplyTimestamp, { noop: true }),
});
