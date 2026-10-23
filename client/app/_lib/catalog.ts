import type { TorStatus } from "./api";

/** Every status, in the order the catalog's filter lists them. */
export const STATUSES: TorStatus[] = ["Draft", "Open", "Awarded", "Closed", "Cancelled"];

/**
 * Where the catalog starts: what someone can still bid on, or soon. Past
 * projects (awarded, many from data.go.th) and closed or cancelled ones are a
 * click away under Status.
 */
export const DEFAULT_STATUSES: TorStatus[] = ["Draft", "Open"];

/** How many statuses differ from the default: ticked that it leaves out, or left out that it ticks. */
export function statusChanges(statuses: TorStatus[]): number {
  return STATUSES.filter((status) => statuses.includes(status) !== DEFAULT_STATUSES.includes(status)).length;
}

/** No status ticked filters on nothing: the same as every status ticked. */
export function showsEveryStatus(statuses: TorStatus[]): boolean {
  return statuses.length === 0 || STATUSES.every((status) => statuses.includes(status));
}
