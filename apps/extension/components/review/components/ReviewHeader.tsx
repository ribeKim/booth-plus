import { i18n } from "#i18n";

type Props = {
  commentCount: number;
  isAuthenticated: boolean;
  isBusy: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

export function ReviewHeader({
  commentCount,
  isAuthenticated,
  isBusy,
  onLogin,
  onLogout,
}: Props) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-slate-400">{i18n.t("reviewBoard.info")}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#fc4d50]">
          {i18n.t("reviewBoard.commentsCount", [commentCount])}
        </span>
        <button
          type="button"
          className="rounded-full border border-[#fc4d50]/40 bg-[#fc4d50]/10 px-3 py-1 text-xs font-medium text-[#fc4d50] transition hover:bg-[#fc4d50]/20 disabled:opacity-60"
          onClick={isAuthenticated ? onLogout : onLogin}
          disabled={isBusy}
        >
          {isAuthenticated
            ? i18n.t("reviewBoard.button.logout")
            : i18n.t("reviewBoard.button.login")}
        </button>
      </div>
    </div>
  );
}
