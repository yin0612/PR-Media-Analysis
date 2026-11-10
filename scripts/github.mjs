import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
const command = args[0];
const credential = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  windowsHide: true,
});
const token = credential
  .split(/\r?\n/)
  .find((x) => x.startsWith("password="))
  ?.slice(9);
if (!token) throw new Error("GitHub credentials unavailable");
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};
async function api(path, method = "GET", body) {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      `GitHub ${res.status}: ${data?.message || "request failed"}`,
    );
  return data;
}
const user = await api("/user");
const repo = `${user.login}/PR-Media-Analysis`;
if (command === "create") {
  let found;
  try {
    found = await api("/repos/" + repo);
  } catch (e) {
    if (!e.message.includes("404")) throw e;
  }
  if (found) {
    console.log(
      JSON.stringify({
        repository: found.html_url,
        created: false,
        defaultBranch: found.default_branch,
      }),
    );
  } else {
    const r = await api("/user/repos", "POST", {
      name: "PR-Media-Analysis",
      description:
        "新聞稿露出整理、訊息採用人工覆核及成效報告｜GitHub Pages + Cloudflare Workers AI",
      private: false,
      auto_init: false,
    });
    console.log(JSON.stringify({ repository: r.html_url, created: true }));
  }
} else if (command === "pages") {
  let page;
  try {
    page = await api("/repos/" + repo + "/pages");
  } catch (e) {
    if (!e.message.includes("404")) throw e;
  }
  if (!page)
    page = await api("/repos/" + repo + "/pages", "POST", {
      build_type: "workflow",
    });
  else if (page.build_type !== "workflow")
    page = await api("/repos/" + repo + "/pages", "PUT", {
      build_type: "workflow",
    });
  console.log(
    JSON.stringify({
      url:
        page?.html_url || `https://${user.login}.github.io/PR-Media-Analysis/`,
      build_type: page?.build_type,
    }),
  );
} else if (command === "config") {
  const path = "/repos/" + repo + "/actions/variables";
  try {
    await api(path + "/VITE_API_URL", "PATCH", {
      name: "VITE_API_URL",
      value: args[1],
    });
  } catch (e) {
    if (!e.message.includes("404")) throw e;
    await api(path, "POST", { name: "VITE_API_URL", value: args[1] });
  }
  console.log("Public backend URL configured");
} else if (command === "runs") {
  const runs = await api("/repos/" + repo + "/actions/runs?per_page=3");
  console.log(
    JSON.stringify(
      runs.workflow_runs.map((r) => ({
        id: r.id,
        status: r.status,
        conclusion: r.conclusion,
        url: r.html_url,
        sha: r.head_sha,
      })),
      null,
      2,
    ),
  );
} else if (command === "jobs") {
  const jobs = await api(`/repos/${repo}/actions/runs/${args[1]}/jobs`);
  console.log(
    JSON.stringify(
      jobs.jobs.map((j) => ({
        name: j.name,
        conclusion: j.conclusion,
        steps: j.steps.map((s) => ({ name: s.name, conclusion: s.conclusion })),
      })),
      null,
      2,
    ),
  );
} else throw new Error("Use create, pages, runs, jobs");
