import { i18n } from "#i18n";
import { IconEye, IconEyeOff, IconLock, IconUser } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import StarIcons from "../../StarIcon";

type Props = {
  content: string;
  score: number;
  isEditing: boolean;
  isSaving: boolean;
  showAnonymousCredentials: boolean;
  anonymousId: string;
  password: string;
  onContentChange: (content: string) => void;
  onScoreChange: (score: number) => void;
  onAnonymousIdChange: (anonymousId: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
};

export function CommentForm({
  content,
  score,
  isEditing,
  isSaving,
  showAnonymousCredentials,
  anonymousId,
  password,
  onContentChange,
  onScoreChange,
  onAnonymousIdChange,
  onPasswordChange,
  onSubmit,
  onCancelEdit,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const isValid =
    content.trim().length > 0 &&
    (!showAnonymousCredentials || (anonymousId.trim().length >= 2 && password.length >= 6));

  return (
    <form className="mt-4 space-y-4 border-t border-slate-100 pt-4" onSubmit={onSubmit}>
      {showAnonymousCredentials && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs font-bold text-slate-700">
              {i18n.t("reviewBoard.anonymous.title")}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {i18n.t("reviewBoard.anonymous.help")}
            </p>
          </div>
          <label className="text-xs font-semibold text-slate-500" htmlFor="anonymous-id">
            {i18n.t("reviewBoard.anonymous.id")}
            <span className="relative mt-1 block">
              <IconUser className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                id="anonymous-id"
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 focus:border-[#fc4d50]/80 focus:outline-none focus:ring-2 focus:ring-[#fc4d50]/10"
                value={anonymousId}
                minLength={2}
                maxLength={50}
                required
                disabled={isSaving}
                onChange={(event) => onAnonymousIdChange(event.target.value)}
                autoComplete="username"
              />
            </span>
          </label>
          <label className="text-xs font-semibold text-slate-500" htmlFor="anonymous-password">
            {i18n.t("reviewBoard.anonymous.password")}
            <span className="relative mt-1 block">
              <IconLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                id="anonymous-password"
                type={showPassword ? "text" : "password"}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-11 text-sm text-slate-900 focus:border-[#fc4d50]/80 focus:outline-none focus:ring-2 focus:ring-[#fc4d50]/10"
                value={password}
                minLength={6}
                maxLength={128}
                required
                disabled={isSaving}
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete={isEditing ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-2 rounded-full p-2 text-slate-400 hover:text-slate-700"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword
                  ? i18n.t("reviewBoard.anonymous.hidePassword")
                  : i18n.t("reviewBoard.anonymous.showPassword")}
                title={showPassword
                  ? i18n.t("reviewBoard.anonymous.hidePassword")
                  : i18n.t("reviewBoard.anonymous.showPassword")}
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </span>
          </label>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-500" htmlFor="review-content">
            {i18n.t("reviewBoard.contentLabel")}
          </label>
          <span className="text-[10px] tabular-nums text-slate-400">{content.length} / 5000</span>
        </div>
        <textarea
          id="review-content"
          rows={4}
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner transition focus:border-[#fc4d50]/80 focus:outline-none"
          value={content}
          maxLength={5000}
          required
          onChange={(event) => onContentChange(event.target.value)}
          placeholder={i18n.t("reviewBoard.placeholder")}
          disabled={isSaving}
        />
      </div>
      <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
        <span className="text-[11px]">{i18n.t("reviewBoard.rating")}</span>
        <StarIcons score={score} interactive onSelect={onScoreChange} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="flex-1 rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          type="submit"
          disabled={isSaving || !isValid}
        >
          {isSaving
            ? i18n.t("reviewBoard.submit.saving")
            : isEditing
              ? i18n.t("reviewBoard.submit.edit")
              : i18n.t("reviewBoard.submit.new")}
        </button>
        {isEditing && (
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            onClick={onCancelEdit}
            disabled={isSaving}
          >
            {i18n.t("reviewBoard.submit.new")}
          </button>
        )}
      </div>
    </form>
  );
}
