import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginDiscordLogin,
  deleteComment,
  fetchComments,
  fetchProfile,
  finishDiscordLogin,
  getSelectedEnvironment,
  importComments,
  logout,
  setSelectedEnvironment,
  setCommentDisabled,
  type AdminComment,
  type Environment,
  type UserProfile,
} from "./api";
import { COMMENT_CSV_HEADERS, parseCommentsCsv } from "./csv";

const PAGE_SIZE = 50;

const EnvironmentSelect = ({
  environment,
  onChange,
}: {
  environment: Environment;
  onChange: (environment: Environment) => void;
}) => (
  <label className="environment-select">
    <span>환경</span>
    <select
      value={environment}
      onChange={(event) => onChange(event.target.value as Environment)}
    >
      <option value="prod">PROD</option>
      <option value="dev">DEV</option>
    </select>
  </label>
);

const parseImportFile = async (file: File): Promise<Record<string, unknown>[]> => {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("CSV 파일만 업로드할 수 있습니다.");
  }
  return parseCommentsCsv(await file.text());
};

export default function App() {
  const callbackHandled = useRef(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authState, setAuthState] = useState<"loading" | "guest" | "admin" | "forbidden">("loading");
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState<Environment>(getSelectedEnvironment);

  const switchEnvironment = (next: Environment) => {
    if (next === environment) return;
    setSelectedEnvironment(next);
    setEnvironment(next);
    location.assign(import.meta.env.BASE_URL);
  };

  const handleLogout = () => {
    void logout().finally(() => {
      setProfile(null);
      setAuthState("guest");
    });
  };

  const loadProfile = useCallback(async () => {
    try {
      const next = await fetchProfile();
      setProfile(next);
      setAuthState(next.admin ? "admin" : "forbidden");
    } catch {
      setAuthState("guest");
    }
  }, []);

  const loadComments = useCallback(async () => {
    if (authState !== "admin") return;
    setBusy(true);
    try {
      const result = await fetchComments(page, PAGE_SIZE, search);
      setComments(result.comments);
      setCount(result.count);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [authState, page, search]);

  useEffect(() => {
    if (callbackHandled.current) return;
    callbackHandled.current = true;
    const parameters = new URLSearchParams(location.search);
    const code = parameters.get("code");
    const state = parameters.get("state");
    if (!code || !state) {
      void loadProfile();
      return;
    }
    finishDiscordLogin(code, state)
      .then(() => {
        history.replaceState({}, "", import.meta.env.BASE_URL);
        return loadProfile();
      })
      .catch((error: Error) => {
        setMessage(error.message);
        setAuthState("guest");
      });
  }, [loadProfile]);

  useEffect(() => void loadComments(), [loadComments]);

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await loadComments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (authState === "loading") return <main className="center-card">로그인 상태 확인 중...</main>;
  if (authState === "guest") {
    return (
      <main className="center-card">
        <h1>BoothPlus Admin</h1>
        <p>관리자 Discord 계정으로 로그인해 주세요.</p>
        <EnvironmentSelect environment={environment} onChange={switchEnvironment} />
        {message && <p className="error">{message}</p>}
        <button className="primary" onClick={beginDiscordLogin}>Discord로 로그인</button>
      </main>
    );
  }
  if (authState === "forbidden") {
    return (
      <main className="center-card">
        <h1>접근 권한 없음</h1>
        <p>{profile?.username} 계정에는 관리자 권한이 없습니다.</p>
        <EnvironmentSelect environment={environment} onChange={switchEnvironment} />
        <button onClick={handleLogout}>다른 계정으로 로그인</button>
      </main>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <main className="layout">
      <header className="topbar">
        <div><h1>BoothPlus 관리자</h1><p>댓글 관리 및 기존 데이터 가져오기</p></div>
        <div className="account">
          <EnvironmentSelect environment={environment} onChange={switchEnvironment} />
          <span>{profile?.username}</span>
          <button onClick={handleLogout}>로그아웃</button>
        </div>
      </header>
      {message && <pre className="message">{message}</pre>}
      <section className="panel">
        <h2>Legacy 댓글 Import</h2>
        <p>CSV 파일을 읽어 최대 500개씩 전송합니다.</p>
        <p className="field-order">필드 순서: {COMMENT_CSV_HEADERS.join(", ")}</p>
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          parseImportFile(file)
            .then(async (records) => {
              setMessage(`${records.length}건을 가져오는 중...`);
              const result = await importComments(records);
              setMessage(`가져옴 ${result.imported}건 / 건너뜀 ${result.skipped}건${result.errors.length ? `\n${result.errors.join("\n")}` : ""}`);
              await loadComments();
            })
            .catch((error: Error) => setMessage(error.message))
            .finally(() => setBusy(false));
        }} />
      </section>
      <section className="panel">
        <form className="search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="내용, 상품 ID, 사용자명 검색" />
          <button className="primary" type="submit">검색</button>
        </form>
        <div className="comments">
          {comments.map((comment) => (
            <article className={comment.disabled ? "comment disabled" : "comment"} key={comment.id}>
              <div className="meta"><span>상품 {comment.productId} · {comment.user.username}</span><time>{new Date(comment.updatedAt).toLocaleString("ko-KR")}</time></div>
              <p>{comment.content}</p>
              <div className="actions"><span>평점 {comment.score}</span><span>👍 {comment.upvotes}</span><span>👎 {comment.downvotes}</span>
                <button onClick={() => void mutate(() => setCommentDisabled(comment.id, !comment.disabled))}>{comment.disabled ? "복구" : "숨김"}</button>
                <button className="danger" onClick={() => { if (confirm("이 댓글을 영구 삭제할까요?")) void mutate(() => deleteComment(comment.id)); }}>삭제</button>
              </div>
            </article>
          ))}
          {!busy && comments.length === 0 && <p className="empty">댓글이 없습니다.</p>}
        </div>
        <footer className="pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>이전</button><span>{page} / {totalPages} · 총 {count}건</span><button disabled={page >= totalPages || busy} onClick={() => setPage(page + 1)}>다음</button></footer>
      </section>
    </main>
  );
}
