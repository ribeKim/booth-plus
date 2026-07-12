import { fetchComments } from "@/components/review/api";
import type { CommentsPage } from "@/components/review/types";
import { useInfiniteQuery } from "@tanstack/react-query";

export const useCommentsQuery = (itemId: string | null, limit = 10) =>
  useInfiniteQuery<CommentsPage, Error>({
    queryKey: ["comments", itemId ?? "unknown", limit],
    queryFn: ({ pageParam }) => fetchComments(itemId!, Number(pageParam), limit),
    enabled: Boolean(itemId),
    refetchOnWindowFocus: false,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.count / lastPage.pageSize);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });
