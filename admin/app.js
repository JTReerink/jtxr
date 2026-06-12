import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
	getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
	getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
	deleteDoc, query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAILS } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const els = {
	signinBtn: $("signin-btn"),
	signoutBtn: $("signout-btn"),
	userInfo: $("user-info"),
	authError: $("auth-error"),
	appWrap: $("app"),
	projectList: $("project-list"),
	newProjectBtn: $("new-project-btn"),
	projectFormWrap: $("project-form-wrap"),
	projectForm: $("project-form"),
	projectFormTitle: $("project-form-title"),
	projectCancel: $("project-cancel"),
	screenshotPreview: $("screenshot-preview"),
	pageHomeForm: $("page-home-form"),
	pageHomeStatus: $("page-home-status"),
	draftBanner: $("draft-banner"),
	draftTime: $("draft-time"),
	draftLoad: $("draft-load"),
	draftDiscard: $("draft-discard"),
	dirtyModal: $("dirty-modal"),
};

let editingProjectId = null;
let projectsCache = [];
let formInitialValues = null;

// ---- Drafts (localStorage) ----
const DRAFT_KEY = "jtxr_project_drafts";
const NEW_DRAFT_ID = "__new__";
const loadDrafts = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { return {}; } };
const saveDrafts = (d) => localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
const getDraft = (id) => loadDrafts()[id || NEW_DRAFT_ID];
function setDraft(id, values) {
	const drafts = loadDrafts();
	drafts[id || NEW_DRAFT_ID] = { ...values, savedAt: Date.now() };
	saveDrafts(drafts);
}
function clearDraft(id) {
	const drafts = loadDrafts();
	delete drafts[id || NEW_DRAFT_ID];
	saveDrafts(drafts);
}

// ---- Form state helpers ----
function getFormValues() {
	return {
		title: els.projectForm.title.value,
		description: els.projectForm.description.value,
		link: els.projectForm.link.value,
		screenshotUrl: els.projectForm.screenshotUrl.value,
	};
}
function setFormValues(v) {
	els.projectForm.title.value = v.title || "";
	els.projectForm.description.value = v.description || "";
	els.projectForm.link.value = v.link || "";
	els.projectForm.screenshotUrl.value = v.screenshotUrl || "";
	updateScreenshotPreview(v.screenshotUrl || "");
}
function snapshotFormState() { formInitialValues = getFormValues(); }
function isFormDirty() {
	if (!formInitialValues) return false;
	if (els.projectFormWrap.classList.contains("hidden")) return false;
	const cur = getFormValues();
	return Object.keys(cur).some((k) => cur[k] !== formInitialValues[k]);
}

// ---- Modal ----
function confirmDirty() {
	return new Promise((resolve) => {
		els.dirtyModal.classList.remove("hidden");
		const handler = (e) => {
			const action = e.target.dataset.modalAction;
			if (!action) return;
			els.dirtyModal.classList.add("hidden");
			els.dirtyModal.removeEventListener("click", handler);
			resolve(action);
		};
		els.dirtyModal.addEventListener("click", handler);
	});
}

async function tryOpenProjectForm(id, data) {
	if (!isFormDirty()) { openProjectForm(id, data); return; }
	const action = await confirmDirty();
	if (action === "cancel") return;
	if (action === "draft") setDraft(editingProjectId, getFormValues());
	openProjectForm(id, data);
}

// ---- Auth ----
els.signinBtn.addEventListener("click", async () => {
	els.authError.classList.add("hidden");
	try {
		await signInWithPopup(auth, new GoogleAuthProvider());
	} catch (e) {
		showAuthError(e.message);
	}
});

els.signoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
	if (!user) {
		els.userInfo.textContent = "Not signed in";
		els.signinBtn.classList.remove("hidden");
		els.signoutBtn.classList.add("hidden");
		els.appWrap.classList.add("hidden");
		return;
	}
	if (!ADMIN_EMAILS.includes(user.email)) {
		showAuthError(`${user.email} is not an admin. Signing out.`);
		signOut(auth);
		return;
	}
	els.userInfo.textContent = `Signed in as ${user.email}`;
	els.signinBtn.classList.add("hidden");
	els.signoutBtn.classList.remove("hidden");
	els.appWrap.classList.remove("hidden");
	loadProjects();
	loadHomePage();
	loadProjectSuggestions();
});

async function loadProjectSuggestions() {
	const linksList = document.getElementById("project-links");
	const shotsList = document.getElementById("project-screenshots");
	try {
		const res = await fetch("https://api.github.com/repos/JTReerink/jtxr/contents/projects");
		if (!res.ok) return;
		const entries = await res.json();
		const dirs = entries.filter((e) => e.type === "dir");
		linksList.innerHTML = dirs.map((d) => `<option value="./projects/${d.name}">`).join("");

		const imgExt = /\.(png|jpe?g|gif|webp|svg)$/i;
		const results = await Promise.all(dirs.map(async (d) => {
			try {
				const r = await fetch(d.url);
				if (!r.ok) return [];
				const files = await r.json();
				return files
					.filter((f) => f.type === "file" && imgExt.test(f.name))
					.map((f) => `./projects/${d.name}/${f.name}`);
			} catch { return []; }
		}));
		shotsList.innerHTML = results.flat().map((p) => `<option value="${p}">`).join("");
	} catch (e) {
		console.warn("project suggestions failed", e);
	}
}

function showAuthError(msg) {
	els.authError.textContent = msg;
	els.authError.classList.remove("hidden");
}

// ---- Tabs ----
document.querySelectorAll(".tab").forEach((btn) => {
	btn.addEventListener("click", () => {
		document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
		const tab = btn.dataset.tab;
		$("tab-projects").classList.toggle("hidden", tab !== "projects");
		$("tab-pages").classList.toggle("hidden", tab !== "pages");
	});
});

// ---- Projects ----
async function loadProjects() {
	els.projectList.innerHTML = "<p class='muted'>Loading…</p>";
	try {
		const snap = await getDocs(query(collection(db, "projects"), orderBy("order", "asc")));
		projectsCache = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
		renderProjectList();
	} catch (e) {
		els.projectList.innerHTML = `<p class='error'>Failed to load: ${e.message}</p>`;
	}
}

function renderProjectList() {
	if (projectsCache.length === 0) {
		els.projectList.innerHTML = "<p class='muted'>No projects yet.</p>";
		return;
	}
	els.projectList.innerHTML = "";
	projectsCache.forEach((p, i) => els.projectList.appendChild(renderProjectItem(p.id, p.data, i)));
}

function renderProjectItem(id, data, index) {
	const last = projectsCache.length - 1;
	const item = document.createElement("div");
	item.className = "item";
	item.innerHTML = `
		<div class="reorder" style="display:flex;flex-direction:column;gap:.25rem">
			<button class="secondary" data-action="up" title="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
			<button class="secondary" data-action="down" title="Move down" ${index === last ? "disabled" : ""}>↓</button>
		</div>
		${data.screenshotUrl ? `<img src="${data.screenshotUrl}" alt="">` : ""}
		<div class="meta">
			<h3></h3>
			<p></p>
			<p class="muted" style="font-size:.8rem;margin-top:.25rem"></p>
		</div>
		<div class="actions">
			<button class="secondary" data-action="edit">Edit</button>
			<button class="danger" data-action="delete">Delete</button>
		</div>
	`;
	item.querySelector("h3").textContent = data.title || "(untitled)";
	item.querySelector("p").textContent = data.description || "";
	item.querySelector(".muted").textContent = data.link || "";
	item.querySelector('[data-action="edit"]').addEventListener("click", () => tryOpenProjectForm(id, data));
	item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteProject(id, data));
	item.querySelector('[data-action="up"]').addEventListener("click", () => moveProject(index, -1));
	item.querySelector('[data-action="down"]').addEventListener("click", () => moveProject(index, 1));
	return item;
}

async function moveProject(index, delta) {
	const target = index + delta;
	if (target < 0 || target >= projectsCache.length) return;
	[projectsCache[index], projectsCache[target]] = [projectsCache[target], projectsCache[index]];
	renderProjectList();
	try {
		const batch = writeBatch(db);
		projectsCache.forEach((p, i) => {
			if (p.data.order !== i) {
				batch.update(doc(db, "projects", p.id), { order: i });
				p.data.order = i;
			}
		});
		await batch.commit();
	} catch (e) {
		alert("Reorder failed: " + e.message);
		await loadProjects();
	}
}

els.newProjectBtn.addEventListener("click", () => tryOpenProjectForm(null, null));
els.projectCancel.addEventListener("click", closeProjectForm);

function openProjectForm(id, data) {
	editingProjectId = id;
	els.projectFormTitle.textContent = id ? "Edit project" : "New project";
	els.projectForm.reset();
	setFormValues({
		title: data?.title,
		description: data?.description,
		link: data?.link,
		screenshotUrl: data?.screenshotUrl,
	});
	snapshotFormState();
	updateDraftBanner(id, data);
	els.projectFormWrap.classList.remove("hidden");
	els.projectFormWrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeProjectForm() {
	editingProjectId = null;
	formInitialValues = null;
	els.projectFormWrap.classList.add("hidden");
	els.draftBanner.classList.add("hidden");
	els.screenshotPreview.classList.add("hidden");
}

function updateDraftBanner(id, data) {
	const draft = getDraft(id);
	if (!draft) { els.draftBanner.classList.add("hidden"); return; }
	const d = new Date(draft.savedAt);
	els.draftTime.textContent = d.toLocaleString();
	els.draftBanner.classList.remove("hidden");
	els.draftLoad.onclick = () => {
		setFormValues(draft);
		snapshotFormState();
		els.draftBanner.classList.add("hidden");
	};
	els.draftDiscard.onclick = () => {
		clearDraft(id);
		els.draftBanner.classList.add("hidden");
	};
}

function updateScreenshotPreview(url) {
	if (url) {
		els.screenshotPreview.src = url;
		els.screenshotPreview.classList.remove("hidden");
	} else {
		els.screenshotPreview.classList.add("hidden");
	}
}

els.projectForm.screenshotUrl.addEventListener("input", (e) => updateScreenshotPreview(e.target.value.trim()));

els.projectForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	const saveBtn = $("project-save");
	saveBtn.disabled = true;
	saveBtn.textContent = "Saving…";
	try {
		const fd = new FormData(els.projectForm);
		const payload = {
			title: fd.get("title").trim(),
			description: fd.get("description").trim(),
			link: fd.get("link").trim(),
			screenshotUrl: fd.get("screenshotUrl").trim(),
			updatedAt: serverTimestamp(),
		};

		const savedId = editingProjectId;
		if (editingProjectId) {
			await updateDoc(doc(db, "projects", editingProjectId), payload);
		} else {
			payload.order = projectsCache.length;
			payload.createdAt = serverTimestamp();
			await addDoc(collection(db, "projects"), payload);
		}
		clearDraft(savedId);
		closeProjectForm();
		await loadProjects();
	} catch (e) {
		alert("Save failed: " + e.message);
	} finally {
		saveBtn.disabled = false;
		saveBtn.textContent = "Save";
	}
});

async function deleteProject(id, data) {
	if (!confirm(`Delete "${data.title}"?`)) return;
	try {
		await deleteDoc(doc(db, "projects", id));
		await loadProjects();
	} catch (e) {
		alert("Delete failed: " + e.message);
	}
}

// ---- Pages ----
async function loadHomePage() {
	try {
		const snap = await getDoc(doc(db, "pages", "home"));
		const data = snap.exists() ? snap.data() : {};
		els.pageHomeForm.title.value = data.title || "";
		els.pageHomeForm.lead.value = (data.lead || []).join("\n");
	} catch (e) {
		els.pageHomeStatus.textContent = "Failed to load: " + e.message;
	}
}

els.pageHomeForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	els.pageHomeStatus.textContent = "Saving…";
	try {
		const fd = new FormData(els.pageHomeForm);
		const lead = fd.get("lead").split("\n").map((s) => s.trim()).filter(Boolean);
		await setDoc(doc(db, "pages", "home"), {
			title: fd.get("title").trim(),
			lead,
			updatedAt: serverTimestamp(),
		}, { merge: true });
		els.pageHomeStatus.textContent = "Saved.";
	} catch (e) {
		els.pageHomeStatus.textContent = "Save failed: " + e.message;
	}
});
