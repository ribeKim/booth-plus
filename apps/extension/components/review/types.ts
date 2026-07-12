export type CommentItem = {
  id: string;
  content: string;
  score: number;
  language?: string;
  upvotes?: number;
  downvotes?: number;
  updatedAt: string;
  user: {
    id: string;
    username: string;
  };
};

export type UserSummary = {
  id: string;
  username: string;
};

export type UserProfile = UserSummary & {
  discord: string;
  hideAvatar: boolean;
  autoCollapse: boolean;
  admin: boolean;
  bio: string;
};

export type MyCommentData = {
  id: string;
  content: string;
  score: number;
};

export type AuthToken = {
  accessToken: string;
  refreshToken: string;
};

export type CommentBody = {
  content: string;
  score: number;
};

export type CommentsPage = {
  count: number;
  comments: CommentItem[];
  page: number;
  pageSize: number;
};
