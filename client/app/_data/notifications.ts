export type NotificationType = "match";

export type MatchedTorSummary = {
  projectId: string;
  projectTitle: string;
  agency: string;
  budget: number;
  matchScore: number;
  matchedSkills: string[];
  daysLeft?: number;
  submissionDeadline?: string;
  status?: "Open" | "Draft" | "Awarded" | "Closed";
  isAmended?: boolean;
};

export type NotificationSnapshot = {
  projectId?: string;
  projectTitle?: string;
  agency?: string;
  budget?: number;
  matchScore?: number;
  matchedSkills?: string[];
  matchedItems: MatchedTorSummary[];
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: { th: string; en: string };
  body: { th: string; en: string };
  createdAt: string;
  isRead: boolean;
  targetUrl: string;
  snapshot: NotificationSnapshot;
};

export const INITIAL_MOCK_NOTIFICATIONS: NotificationItem[] = [];
