import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
	getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
	getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
	deleteDoc, query, orderBy, serverTimestamp
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
};

let editingProjectId = null;

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
		if (snap.empty) {
			els.projectList.innerHTML = "<p class='muted'>No projects yet.</p>";
			return;
		}
		els.projectList.innerHTML = "";
		snap.forEach((d) => els.projectList.appendChild(renderProjectItem(d.id, d.data())));
	} catch (e) {
		els.projectList.innerHTML = `<p class='error'>Failed to load: ${e.message}</p>`;
	}
}

function renderProjectItem(id, data) {
	const item = document.createElement("div");
	item.className = "item";
	item.innerHTML = `
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
	item.querySelector('[data-action="edit"]').addEventListener("click", () => openProjectForm(id, data));
	item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteProject(id, data));
	return item;
}

els.newProjectBtn.addEventListener("click", () => openProjectForm(null, null));
els.projectCancel.addEventListener("click", closeProjectForm);

function openProjectForm(id, data) {
	editingProjectId = id;
	els.projectFormTitle.textContent = id ? "Edit project" : "New project";
	els.projectForm.reset();
	els.projectForm.title.value = data?.title || "";
	els.projectForm.description.value = data?.description || "";
	els.projectForm.link.value = data?.link || "";
	els.projectForm.screenshotUrl.value = data?.screenshotUrl || "";
	els.projectForm.order.value = data?.order ?? 0;
	updateScreenshotPreview(data?.screenshotUrl);
	els.projectFormWrap.classList.remove("hidden");
}

function closeProjectForm() {
	editingProjectId = null;
	els.projectFormWrap.classList.add("hidden");
	els.screenshotPreview.classList.add("hidden");
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
			order: Number(fd.get("order")) || 0,
			updatedAt: serverTimestamp(),
		};

		if (editingProjectId) {
			await updateDoc(doc(db, "projects", editingProjectId), payload);
		} else {
			payload.createdAt = serverTimestamp();
			await addDoc(collection(db, "projects"), payload);
		}
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
