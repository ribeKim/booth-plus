import { i18n } from "#i18n";
import {
  API_BASE,
  deleteComment,
  exchangeDiscordCode,
  submitComment,
  voteComment,
} from "@/components/review/api";
import { CommentForm } from "@/components/review/components/CommentForm";
import { CommentList } from "@/components/review/components/CommentList";
import { ReviewHeader } from "@/components/review/components/ReviewHeader";
import { getCurrentItemId } from "@/components/review/item";
import { sendMessage } from "@/components/review/messaging";
import {
  useMyCommentQuery,
  useCommentsQuery,
  useUserProfileQuery,
} from "@/components/review/queries";
import type { CommentBody } from "@/components/review/types";
import { ApiError } from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { showErrorToast } from "@/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";

const DEFAULT_SCORE = 8;
const COMMENTS_PAGE_SIZE = 10;

type SubmitVariables = {
  itemId: string;
  method: "POST" | "PUT";
  body: CommentBody;
};

export function ReviewBoard() {
  const itemId = getCurrentItemId();
  const queryClient = useQueryClient();
  const userQuery = useUserProfileQuery();
  const commentsQuery = useCommentsQuery(itemId, COMMENTS_PAGE_SIZE);
  const myCommentQuery = useMyCommentQuery(itemId, {
    enabled: Boolean(itemId && userQuery.data),
  });
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({ content: "", score: DEFAULT_SCORE });

  const comments = commentsQuery.data?.pages.flatMap((page) => page.comments) ?? [];
  const commentCount = commentsQuery.data?.pages[0]?.count ?? 0;
  const myComment = myCommentQuery.data ?? null;
  const isAuthenticated = Boolean(userQuery.data);

  useEffect(() => {
    if (!myComment) return;
    setForm({ content: myComment.content, score: myComment.score });
  }, [myComment]);

  useEffect(() => {
    const element = loadMoreTriggerRef.current;
    if (!element || !commentsQuery.hasNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !commentsQuery.isFetchingNextPage) {
          commentsQuery.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [commentsQuery.fetchNextPage, commentsQuery.hasNextPage, commentsQuery.isFetchingNextPage]);

  const invalidateComments = async () => {
    if (!itemId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["comments", itemId] }),
      queryClient.invalidateQueries({ queryKey: ["myComment", itemId] }),
    ]);
  };

  const submitMutation = useMutation({
    mutationFn: ({ itemId: targetItemId, method, body }: SubmitVariables) =>
      submitComment(targetItemId, method, body),
    onSuccess: invalidateComments,
    onError: (error: Error) => {
      showErrorToast(
        error instanceof ApiError && error.status === 400
          ? i18n.t("messages.checkContent")
          : i18n.t("messages.reviewSaveError"),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: async () => {
      setForm({ content: "", score: DEFAULT_SCORE });
      await invalidateComments();
    },
    onError: () => showErrorToast(i18n.t("messages.reviewDeleteError")),
  });

  const voteMutation = useMutation({
    mutationFn: ({ commentId, direction }: { commentId: string; direction: "upvote" | "downvote" }) =>
      voteComment(commentId, direction),
    onSuccess: invalidateComments,
    onError: () => showErrorToast(i18n.t("messages.voteError")),
  });

  const refreshAuthData = async () => {
    await Promise.all([userQuery.refetch(), myCommentQuery.refetch()]);
  };

  const handleLogin = async () => {
    try {
      const redirectUrl = `https://${browser.runtime.id}.chromiumapp.org/`;
      const state = crypto.randomUUID();
      const authUrl =
        `${API_BASE}/auth/oauth/discord?redirectUrl=${encodeURIComponent(redirectUrl)}` +
        `&state=${encodeURIComponent(state)}`;
      const authorization = await sendMessage("loginWithDiscord", authUrl);
      if (!authorization || authorization.state !== state) {
        throw new Error("Discord authorization was cancelled or invalid");
      }
      const tokens = await exchangeDiscordCode(authorization.code, redirectUrl);
      await authTokenStorage.setValue(tokens);
      await refreshAuthData();
    } catch {
      showErrorToast(i18n.t("messages.loginRequired"));
    }
  };

  const handleLogout = async () => {
    try {
      await authTokenStorage.setValue(null);
      setForm({ content: "", score: DEFAULT_SCORE });
      await refreshAuthData();
    } catch {
      showErrorToast(i18n.t("messages.logoutError"));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = form.content.trim();
    if (!itemId || !content) {
      if (!content) showErrorToast(i18n.t("messages.emptyContent"));
      return;
    }
    submitMutation.mutate({
      itemId,
      method: myComment ? "PUT" : "POST",
      body: { content, score: form.score },
    });
  };

  const handleVote = (commentId: string, direction: "upvote" | "downvote") => {
    if (!isAuthenticated) {
      showErrorToast(i18n.t("messages.loginRequired"));
      return;
    }
    voteMutation.mutate({ commentId, direction });
  };

  if (!itemId) return null;

  const isFormBusy = submitMutation.isPending || deleteMutation.isPending;
  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <ReviewHeader
          commentCount={commentCount}
          isAuthenticated={isAuthenticated}
          isBusy={isFormBusy || userQuery.isFetching}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
        <CommentList
          comments={comments}
          currentUserId={userQuery.data?.id}
          isAuthenticated={isAuthenticated}
          isLoading={commentsQuery.isLoading}
          isFetchingMore={commentsQuery.isFetchingNextPage}
          isVoting={voteMutation.isPending}
          loadMoreRef={loadMoreTriggerRef}
          onVote={handleVote}
        />
        <CommentForm
          content={form.content}
          score={form.score}
          hasComment={Boolean(myComment)}
          isSaving={submitMutation.isPending}
          isDeleting={deleteMutation.isPending}
          onContentChange={(content) => setForm((current) => ({ ...current, content }))}
          onScoreChange={(score) => !isFormBusy && setForm((current) => ({ ...current, score }))}
          onSubmit={handleSubmit}
          onDelete={() => deleteMutation.mutate(itemId)}
        />
      </div>
    </div>
  );
}
