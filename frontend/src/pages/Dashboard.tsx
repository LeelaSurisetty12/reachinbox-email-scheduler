import {
  CalendarClock,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";

import {
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import toast from "react-hot-toast";

import ComposeModal from "../components/ComposeModal";
import EmailTable from "../components/EmailTable";
import api from "../services/api";

import type { Email } from "../types/email";
import type { User } from "../types/user";

type Tab = "scheduled" | "sent";

interface Sender {
  id: string;
  email: string;
  name: string;
}

export default function Dashboard() {
  const navigate = useNavigate();

  // =====================================================
  // USER
  // =====================================================

  const [user, setUser] =
    useState<User | null>(null);

  const [loadingUser, setLoadingUser] =
    useState(true);

  // =====================================================
  // EMAILS
  // =====================================================

  const [
    scheduledEmails,
    setScheduledEmails,
  ] = useState<Email[]>([]);

  const [
    sentEmails,
    setSentEmails,
  ] = useState<Email[]>([]);

  const [
    loadingEmails,
    setLoadingEmails,
  ] = useState(false);

  const [
    activeTab,
    setActiveTab,
  ] = useState<Tab>("scheduled");

  // =====================================================
  // SEARCH
  // =====================================================

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    searchActive,
    setSearchActive,
  ] = useState(false);

  // =====================================================
  // COMPOSE
  // =====================================================

  const [
    showCompose,
    setShowCompose,
  ] = useState(false);

  // =====================================================
  // SENDERS
  // =====================================================

  const [
    senders,
    setSenders,
  ] = useState<Sender[]>([]);

  const [
    selectedSender,
    setSelectedSender,
  ] = useState<Sender | null>(null);

  // =====================================================
  // SLACK
  // =====================================================

  const [
    slackConnected,
    setSlackConnected,
  ] = useState(false);

  const [
    slackLoading,
    setSlackLoading,
  ] = useState(false);

  // =====================================================
  // LOGOUT
  // =====================================================

  const handleLogout =
    async () => {
      try {
        await api.post(
          "/api/auth/logout"
        );
      } catch (error) {
        console.error(
          "Logout error:",
          error
        );
      } finally {
        navigate("/login");
      }
    };

  // =====================================================
  // LOAD USER
  // =====================================================

  useEffect(() => {
    const initializeUser =
      async () => {
        try {
          const response =
            await api.get(
              "/api/auth/me"
            );

          if (
            !response.data?.user
          ) {
            throw new Error(
              "User information not found"
            );
          }

          setUser(
            response.data.user
          );
        } catch (error) {
          console.error(
            "Failed to load user:",
            error
          );

          toast.error(
            "Please login to continue."
          );

          navigate("/login");
        } finally {
          setLoadingUser(false);
        }
      };

    initializeUser();
  }, [navigate]);

  // =====================================================
  // SLACK CALLBACK
  // =====================================================

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const slack =
      params.get("slack");

    if (
      slack === "connected"
    ) {
      toast.success(
        "Slack connected successfully!"
      );

      setSlackConnected(true);

      window.history.replaceState(
        {},
        document.title,
        "/dashboard"
      );
    }
  }, []);

  // =====================================================
  // LOAD EMAILS
  // =====================================================

  const loadEmails =
    async () => {
      setLoadingEmails(true);

      try {
        const [
          scheduledResponse,
          sentResponse,
        ] = await Promise.all([
          api.get(
            "/api/emails/scheduled"
          ),

          api.get(
            "/api/emails/sent"
          ),
        ]);

        setScheduledEmails(
          scheduledResponse.data
            ?.emails || []
        );

        setSentEmails(
          sentResponse.data
            ?.emails || []
        );
      } catch (error) {
        console.error(
          "Failed to load emails:",
          error
        );

        toast.error(
          "Failed to load emails"
        );
      } finally {
        setLoadingEmails(false);
      }
    };

  // =====================================================
  // AUTO REFRESH
  // =====================================================

  useEffect(() => {
    if (!user) {
      return;
    }

    loadEmails();

    const interval =
      window.setInterval(() => {
        loadEmails();
      }, 5000);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [user]);

  // =====================================================
  // LOAD SENDERS
  // =====================================================

  useEffect(() => {
    if (!user) {
      return;
    }

    const loadSenders =
      async () => {
        try {
          const response =
            await api.get(
              "/api/senders"
            );

          const loadedSenders: Sender[] =
            response.data
              ?.senders || [];

          setSenders(
            loadedSenders
          );

          if (
            loadedSenders.length >
            0
          ) {
            setSelectedSender(
              loadedSenders[0]
            );
          } else {
            setSelectedSender(
              null
            );
          }
        } catch (error) {
          console.error(
            "Failed to load senders:",
            error
          );

          toast.error(
            "Failed to load senders"
          );
        }
      };

    loadSenders();
  }, [user]);

  // =====================================================
  // CHECK SLACK
  // =====================================================

  const checkSlackConnection =
    async () => {
      try {
        const response =
          await api.get(
            "/auth/slack/status"
          );

        setSlackConnected(
          Boolean(
            response.data
              ?.connected
          )
        );
      } catch (error) {
        console.error(
          "Failed to check Slack status:",
          error
        );

        setSlackConnected(false);
      }
    };

  useEffect(() => {
    if (!user) {
      return;
    }

    checkSlackConnection();
  }, [user]);

  // =====================================================
  // CONNECT SLACK
  // =====================================================

  const handleConnectSlack =
    async () => {
      setSlackLoading(true);

      try {
        const response =
          await api.post(
            "/auth/slack/connect"
          );

        const authorizeUrl =
          response.data
            ?.authorizeUrl;

        if (
          !authorizeUrl
        ) {
          throw new Error(
            "Slack authorization URL was not returned"
          );
        }

        window.location.href =
          authorizeUrl;
      } catch (error) {
        console.error(
          "Slack connection error:",
          error
        );

        toast.error(
          "Failed to start Slack connection"
        );

        setSlackLoading(false);
      }
    };

  // =====================================================
  // DISCONNECT SLACK
  // =====================================================

  const handleDisconnectSlack =
    async () => {
      const confirmed =
        window.confirm(
          "Disconnect Slack from ReachInbox?"
        );

      if (!confirmed) {
        return;
      }

      setSlackLoading(true);

      try {
        await api.post(
          "/auth/slack/disconnect"
        );

        setSlackConnected(
          false
        );

        toast.success(
          "Slack disconnected"
        );
      } catch (error) {
        console.error(
          "Slack disconnect error:",
          error
        );

        toast.error(
          "Failed to disconnect Slack"
        );
      } finally {
        setSlackLoading(false);
      }
    };

  // =====================================================
  // DELETE ONE EMAIL
  // =====================================================

  const handleDeleteEmail =
    async (
      emailId: string
    ) => {
      const confirmed =
        window.confirm(
          "Are you sure you want to delete this email?"
        );

      if (!confirmed) {
        return;
      }

      try {
        await api.delete(
          `/api/emails/${emailId}`
        );

        toast.success(
          "Email deleted successfully"
        );

        await loadEmails();
      } catch (error) {
        console.error(
          "Delete email error:",
          error
        );

        toast.error(
          "Failed to delete email"
        );
      }
    };

  // =====================================================
  // DELETE MANY EMAILS
  // =====================================================

  const handleDeleteManyEmails =
    async (
      emailIds: string[]
    ) => {
      if (
        emailIds.length ===
        0
      ) {
        return;
      }

      try {
        await api.post(
          "/api/emails/bulk-delete",
          {
            emailIds,
          }
        );

        toast.success(
          `${emailIds.length} email${
            emailIds.length ===
            1
              ? ""
              : "s"
          } deleted successfully`
        );

        await loadEmails();
      } catch (error) {
        console.error(
          "Bulk delete error:",
          error
        );

        toast.error(
          "Failed to delete selected emails"
        );
      }
    };

  // =====================================================
  // SEARCH
  // =====================================================

  const handleSearch =
    async () => {
      const query =
        searchQuery.trim();

      if (!query) {
        setSearchActive(false);

        await loadEmails();

        return;
      }

      setSearching(true);

      try {
        const response =
          await api.get(
            "/api/emails/search",
            {
              params: {
                q: query,
              },
            }
          );

        const results: Email[] =
          response.data
            ?.emails || [];

        setScheduledEmails(
          results.filter(
            (email) =>
              email.status ===
                "SCHEDULED" ||
              email.status ===
                "PROCESSING"
          )
        );

        setSentEmails(
          results.filter(
            (email) =>
              email.status ===
                "SENT" ||
              email.status ===
                "FAILED"
          )
        );

        setSearchActive(true);

        if (
          results.length ===
          0
        ) {
          toast(
            "No matching emails found."
          );
        }
      } catch (error) {
        console.error(
          "Search error:",
          error
        );

        toast.error(
          "Failed to search emails"
        );
      } finally {
        setSearching(false);
      }
    };

  // =====================================================
  // SEARCH ENTER KEY
  // =====================================================

  const handleSearchKeyDown =
    (
      event: KeyboardEvent<HTMLInputElement>
    ) => {
      if (
        event.key === "Enter"
      ) {
        handleSearch();
      }
    };

  // =====================================================
  // CLEAR SEARCH
  // =====================================================

  const clearSearch =
    async () => {
      setSearchQuery("");
      setSearchActive(false);

      await loadEmails();
    };

  // =====================================================
  // MANUAL REFRESH
  // =====================================================

  const handleRefresh =
    async () => {
      await loadEmails();

      toast.success(
        "Dashboard refreshed"
      );
    };

  // =====================================================
  // LOADING
  // =====================================================

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="h-7 w-7 animate-spin text-slate-400" />

          <p className="text-sm text-slate-500">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // =====================================================
  // CURRENT EMAIL LIST
  // =====================================================

  const displayedEmails =
    activeTab === "scheduled"
      ? scheduledEmails
      : sentEmails;

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          {/* Brand */}

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
              <Send className="h-5 w-5 text-slate-950" />
            </div>

            <div>
              <h1 className="text-lg font-bold">
                ReachInbox
              </h1>

              <p className="text-xs text-slate-500">
                Email Scheduler
              </p>
            </div>
          </div>

          {/* User */}

          <div className="flex items-center gap-3">

            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-10 w-10 rounded-full border border-slate-700 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 font-semibold text-white">
                {user.name
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-white">
                {user.name}
              </p>

              <p className="text-xs text-slate-400">
                {user.email}
              </p>
            </div>

            <button
              type="button"
              onClick={
                handleLogout
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ================================================= */}
      {/* MAIN */}
      {/* ================================================= */}

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-8">

          {/* ================================================= */}
          {/* PAGE HEADER                                         */}
          {/* ================================================= */}

          <section className="flex flex-col justify-between gap-5 md:flex-row md:items-center">

            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Email Dashboard
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Manage your scheduled and sent emails.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">

              {/* Slack */}

              {slackConnected ? (
                <button
                  type="button"
                  onClick={
                    handleDisconnectSlack
                  }
                  disabled={
                    slackLoading
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {slackLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}

                  Slack Connected
                </button>
              ) : (
                <button
                  type="button"
                  onClick={
                    handleConnectSlack
                  }
                  disabled={
                    slackLoading
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {slackLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}

                  Connect Slack
                </button>
              )}

              {/* Compose */}

              <button
                type="button"
                onClick={() =>
                  setShowCompose(
                    true
                  )
                }
                disabled={
                  !selectedSender
                }
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Compose New Email
              </button>

            </div>
          </section>

          {/* ================================================= */}
          {/* ACTIVE SENDER                                      */}
          {/* ================================================= */}

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Active Sender
                </p>

                <p className="mt-1 text-sm font-medium text-slate-200">
                  {selectedSender
                    ? `${selectedSender.name} (${selectedSender.email})`
                    : "No sender available"}
                </p>
              </div>

              <div className="text-sm text-slate-500">
                {senders.length} sender
                {senders.length ===
                1
                  ? ""
                  : "s"} connected
              </div>

            </div>
          </section>

          {/* ================================================= */}
          {/* STATS */}
          {/* ================================================= */}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Scheduled */}

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between">

                <div>
                  <p className="text-sm text-slate-400">
                    Scheduled
                  </p>

                  <p className="mt-2 text-3xl font-bold">
                    {scheduledEmails.length}
                  </p>

                  <p className="mt-1 text-xs text-slate-600">
                    Waiting to be sent
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800 p-3">
                  <CalendarClock className="h-6 w-6 text-slate-400" />
                </div>

              </div>
            </div>

            {/* Sent */}

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between">

                <div>
                  <p className="text-sm text-slate-400">
                    Sent
                  </p>

                  <p className="mt-2 text-3xl font-bold">
                    {sentEmails.length}
                  </p>

                  <p className="mt-1 text-xs text-slate-600">
                    Processed emails
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800 p-3">
                  <Send className="h-6 w-6 text-slate-400" />
                </div>

              </div>
            </div>

          </section>

          {/* ================================================= */}
          {/* TABS */}
          {/* ================================================= */}

          <section>
            <div className="border-b border-slate-800">
              <div className="flex gap-8">

                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      "scheduled"
                    )
                  }
                  className={`border-b-2 px-1 py-4 text-sm font-semibold transition ${
                    activeTab ===
                    "scheduled"
                      ? "border-white text-white"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Scheduled Emails
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      "sent"
                    )
                  }
                  className={`border-b-2 px-1 py-4 text-sm font-semibold transition ${
                    activeTab ===
                    "sent"
                      ? "border-white text-white"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Sent Emails
                </button>

              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* EMAILS                                             */}
          {/* ================================================= */}

          <section className="space-y-4">

            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">

              <div>
                <h3 className="text-lg font-semibold">
                  {activeTab ===
                  "scheduled"
                    ? "Scheduled Emails"
                    : "Sent Emails"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {displayedEmails.length} email
                  {displayedEmails.length ===
                  1
                    ? ""
                    : "s"}

                  {searchActive
                    ? " found"
                    : ""}
                </p>
              </div>

              {/* ================================================= */}
              {/* SEARCH + REFRESH                                   */}
              {/* ================================================= */}

              <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">

                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 xl:w-80">

                  <Search className="h-4 w-4 shrink-0 text-slate-500" />

                  <input
                    type="text"
                    value={
                      searchQuery
                    }
                    onChange={(
                      event
                    ) =>
                      setSearchQuery(
                        event.target
                          .value
                      )
                    }
                    onKeyDown={
                      handleSearchKeyDown
                    }
                    placeholder="Search emails..."
                    className="min-w-0 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                  />

                </div>

                <button
                  type="button"
                  onClick={
                    handleSearch
                  }
                  disabled={
                    searching
                  }
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {searching
                    ? "..."
                    : "Search"}
                </button>

                {searchActive && (
                  <button
                    type="button"
                    onClick={
                      clearSearch
                    }
                    className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  >
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  onClick={
                    handleRefresh
                  }
                  disabled={
                    loadingEmails
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Refresh emails"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      loadingEmails
                        ? "animate-spin"
                        : ""
                    }`}
                  />

                  Refresh
                </button>

              </div>
            </div>

            {/* ================================================= */}
            {/* EMAIL TABLE                                        */}
            {/* ================================================= */}

            {loadingEmails ||
            searching ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">

                <div className="flex flex-col items-center gap-3">

                  <LoaderCircle className="h-6 w-6 animate-spin text-slate-500" />

                  <p className="text-sm text-slate-500">
                    Loading emails...
                  </p>

                </div>

              </div>
            ) : (
              <EmailTable
                emails={
                  displayedEmails
                }
                type={
                  activeTab
                }
                onDelete={
                  handleDeleteEmail
                }
                onDeleteMany={
                  handleDeleteManyEmails
                }
              />
            )}

          </section>
        </div>
      </main>

      {/* ================================================= */}
      {/* COMPOSE MODAL                                       */}
      {/* ================================================= */}

      {showCompose && (
        <ComposeModal
          sender={
            selectedSender
          }
          onClose={() =>
            setShowCompose(
              false
            )
          }
          onScheduled={async () => {
            setShowCompose(
              false
            );

            setSearchQuery(
              ""
            );

            setSearchActive(
              false
            );

            await loadEmails();
          }}
        />
      )}
    </div>
  );
}