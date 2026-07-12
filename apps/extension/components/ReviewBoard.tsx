import { i18n } from "#i18n";
import {
  API_BASE,
  createComment,
  deleteComment,
  exchangeDiscordCode,
  revokeSession,
  updateComment,
  voteComment,
} from "@/components/review/api";
import { CommentForm } from "@/components/review/components/CommentForm";
import { CommentList } from "@/components/review/components/CommentList";
import { DeleteCommentDialog } from "@/components/review/components/DeleteCommentDialog";
import { ReviewHeader } from "@/components/review/components/ReviewHeader";
import { getCurrentItemId } from "@/components/review/item";
import { sendMessage } from "@/components/review/messaging";
import { useCommentsQuery, useUserProfileQuery } from "@/components/review/queries";
import type { CommentBody, CommentItem } from "@/components/review/types";
import { ApiError } from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { showErrorToast } from "@/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";

const DEFAULT_SCORE = 8;
const COMMENTS_PAGE_SIZE = 10;
const emptyForm = () => ({ content: "", score: DEFAULT_SCORE, anonymousId: "", password: "" });

type SubmitVariables = {
  itemId: string;
  commentId?: string;
  body: CommentBody;
};

export function ReviewBoard() {
  const itemId = getCurrentItemId();
  const queryClient = useQueryClient();
  const userQuery = useUserProfileQuery();
  const commentsQuery = useCommentsQuery(itemId, COMMENTS_PAGE_SIZE);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);
  const [deletingComment, setDeletingComment] = useState<CommentItem | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const comments = commentsQuery.data?.pages.flatMap((page) => page.comments) ?? [];
  const commentCount = commentsQuery.data?.pages[0]?.count ?? 0;
  const isAuthenticated = Boolean(userQuery.data);

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
    await queryClient.invalidateQueries({ queryKey: ["comments", itemId] });
  };

  const submitMutation = useMutation({
    mutationFn: async ({ itemId: targetItemId, commentId, body }: SubmitVariables) => {
      if (commentId) {
        await updateComment(commentId, body);
      } else {
        await createComment(targetItemId, body);
      }
    },
    onSuccess: async () => {
      setEditingComment(null);
      setForm(emptyForm());
      await invalidateComments();
    },
    onError: (error: Error) => {
      showErrorToast(
        error instanceof ApiError && error.status === 403
          ? i18n.t("messages.anonymousPasswordError")
          : error instanceof ApiError && error.status === 400
            ? i18n.t("messages.checkContent")
            : i18n.t("messages.reviewSaveError"),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ commentId, password }: { commentId: string; password?: string }) =>
      deleteComment(commentId, password),
    onSuccess: async (_, { commentId }) => {
      if (editingComment?.id === commentId) {
        setEditingComment(null);
        setForm(emptyForm());
      }
      setDeletingComment(null);
      setDeletePassword("");
      setDeleteError("");
      await invalidateComments();
    },
    onError: (error: Error) => {
      setDeleteError(
        error instanceof ApiError && error.status === 403
          ? i18n.t("messages.anonymousPasswordError")
          : i18n.t("messages.reviewDeleteError"),
      );
    },
  });

  const voteMutation = useMutation({
    mutationFn: ({ commentId, direction }: { commentId: string; direction: "upvote" | "downvote" }) =>
      voteComment(commentId, direction),
    onSuccess: invalidateComments,
    onError: () => showErrorToast(i18n.t("messages.voteError")),
  });

  const refreshAuthData = async () => {
    await userQuery.refetch();
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
    const tokens = await authTokenStorage.getValue();
    try {
      if (tokens?.refreshToken) await revokeSession(tokens.refreshToken);
    } catch {
      // Always clear local credentials even if the best-effort revocation request fails.
    } finally {
      await authTokenStorage.setValue(null);
      setEditingComment(null);
      setForm(emptyForm());
      await refreshAuthData();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = form.content.trim();
    const usesAnonymousCredentials = !isAuthenticated || Boolean(editingComment?.canManage);
    if (!itemId || !content) {
      if (!content) showErrorToast(i18n.t("messages.emptyContent"));
      return;
    }
    if (
      usesAnonymousCredentials &&
      (form.anonymousId.trim().length < 2 || form.password.length < 6)
    ) {
      showErrorToast(i18n.t("messages.anonymousCredentialsRequired"));
      return;
    }
    submitMutation.mutate({
      itemId,
      commentId: editingComment?.id,
      body: {
        content,
        score: form.score,
        ...(usesAnonymousCredentials
          ? { anonymousId: form.anonymousId.trim(), password: form.password }
          : {}),
      },
    });
  };

  const handleVote = (commentId: string, direction: "upvote" | "downvote") => {
    if (!isAuthenticated) {
      showErrorToast(i18n.t("messages.loginRequired"));
      return;
    }
    voteMutation.mutate({ commentId, direction });
  };

  const handleEdit = (comment: CommentItem) => {
    setEditingComment(comment);
    setForm({
      content: comment.content,
      score: comment.score,
      anonymousId: comment.canManage ? comment.user.username : "",
      password: "",
    });
  };

  const handleDelete = (comment: CommentItem) => {
    setDeletingComment(comment);
    setDeletePassword("");
    setDeleteError("");
  };

  const confirmDelete = () => {
    if (!deletingComment) return;
    if (deletingComment.canManage && deletePassword.length < 6) {
      setDeleteError(i18n.t("messages.anonymousCredentialsRequired"));
      return;
    }
    deleteMutation.mutate({
      commentId: deletingComment.id,
      password: deletingComment.canManage ? deletePassword : undefined,
    });
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setForm(emptyForm());
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
          isDeleting={deleteMutation.isPending}
          loadMoreRef={loadMoreTriggerRef}
          onVote={handleVote}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
        <CommentForm
          content={form.content}
          score={form.score}
          isEditing={Boolean(editingComment)}
          isSaving={submitMutation.isPending}
          showAnonymousCredentials={!isAuthenticated || Boolean(editingComment?.canManage)}
          anonymousId={form.anonymousId}
          password={form.password}
          onContentChange={(content) => setForm((current) => ({ ...current, content }))}
          onScoreChange={(score) => !isFormBusy && setForm((current) => ({ ...current, score }))}
          onAnonymousIdChange={(anonymousId) =>
            setForm((current) => ({ ...current, anonymousId }))
          }
          onPasswordChange={(password) => setForm((current) => ({ ...current, password }))}
          onSubmit={handleSubmit}
          onCancelEdit={cancelEdit}
        />
      </div>
      <DeleteCommentDialog
        comment={deletingComment}
        password={deletePassword}
        error={deleteError}
        isDeleting={deleteMutation.isPending}
        onPasswordChange={(password) => {
          setDeletePassword(password);
          setDeleteError("");
        }}
        onCancel={() => {
          setDeletingComment(null);
          setDeletePassword("");
          setDeleteError("");
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
