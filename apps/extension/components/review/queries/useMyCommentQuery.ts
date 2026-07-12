import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { fetchMyComment } from "@/components/review/api";
import type { MyCommentData } from "@/components/review/types";

type MyCommentQueryOptions = Omit<UseQueryOptions<MyCommentData | null, Error>, "queryKey" | "queryFn">;

export const useMyCommentQuery = (itemId: string | null, options?: MyCommentQueryOptions) =>
  useQuery<MyCommentData | null>({
    queryKey: ["myComment", itemId],
    queryFn: () => fetchMyComment(itemId!),
    enabled: Boolean(itemId),
    refetchOnWindowFocus: false,
    retry: false,
    ...options,
  });
