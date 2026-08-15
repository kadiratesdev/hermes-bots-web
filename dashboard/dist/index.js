(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !SDK.React || !window.__HERMES_PLUGINS__) return;

  const { React } = SDK;
  const h = React.createElement;
  const C = SDK.components || {};
  const hooks = SDK.hooks || {};
  const cn = (SDK.utils && SDK.utils.cn) || function () {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
  };
  const isoTimeAgo = (SDK.utils && SDK.utils.isoTimeAgo) || function (iso) {
    return iso ? String(iso) : "";
  };

  const useState = hooks.useState || React.useState;
  const useEffect = hooks.useEffect || React.useEffect;
  const useCallback = hooks.useCallback || React.useCallback;

  const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

  function parseApiError(err) {
    const raw = (err && err.message) ? String(err.message) : String(err || "");
    const m = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
    const body = m ? m[2] : raw;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
      if (parsed && parsed.detail && typeof parsed.detail.message === "string") {
        return parsed.detail.message;
      }
    } catch (_e) { /* not JSON */ }
    return body || raw || "Bilinmeyen hata";
  }

  function callApi(method, args) {
    const fn = SDK.api && SDK.api[method];
    if (typeof fn !== "function") {
      return Promise.reject(new Error("SDK.api." + method + " bu dashboard sürümünde yok."));
    }
    return fn.apply(SDK.api, args || []);
  }

  function initials(name) {
    const parts = String(name || "").split(/[-_\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    const s = String(name || "?").replace(/[^a-zA-Z0-9]/g, "");
    return (s.slice(0, 2) || "?").toUpperCase();
  }

  function jobSchedule(job) {
    if (!job) return "";
    if (job.schedule_display) return job.schedule_display;
    if (job.schedule && typeof job.schedule === "object") {
      return job.schedule.display || job.schedule.expr || job.schedule.kind || "";
    }
    if (typeof job.schedule === "string") return job.schedule;
    return "";
  }

  function normalizeJobs(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.jobs)) return data.jobs;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function isProtectedProfile(p) {
    if (!p) return true;
    return !!p.is_default || p.name === "default";
  }

  function openChat(name) {
    window.location.assign("/chat?profile=" + encodeURIComponent(name));
  }

  function useConfirmDeleteSafe(onDelete) {
    const native = hooks.useConfirmDelete;
    if (typeof native === "function") {
      return native({ onDelete: onDelete });
    }
    return {
      requestDelete: function (id) {
        if (window.confirm("Bu öğeyi silmek istediğinize emin misiniz?")) {
          Promise.resolve(onDelete(id)).catch(function () { /* surfaced elsewhere */ });
        }
      },
      confirm: function () { return Promise.resolve(); },
      cancel: function () {},
      isOpen: false,
      isDeleting: false,
      pendingId: null,
    };
  }

  function FieldLabel(props) {
    const Comp = C.Label || "label";
    return h(Comp, { className: cn("text-sm font-medium", props.className), htmlFor: props.htmlFor }, props.children);
  }

  function TextInput(props) {
    const Comp = C.Input || "input";
    return h(Comp, props);
  }

  function AreaInput(props) {
    const Comp = C.Textarea || "textarea";
    return h(Comp, cnProps(props, Comp === "textarea" ? "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" : ""));
  }

  function cnProps(props, extra) {
    const next = {};
    for (const k in props) next[k] = props[k];
    next.className = cn(extra, props.className);
    return next;
  }

  function Btn(props) {
    const Comp = C.Button || "button";
    const children = props.children;
    const rest = {};
    for (const k in props) {
      if (k !== "children") rest[k] = props[k];
    }
    if (Comp === "button" && !rest.type) rest.type = "button";
    return h(Comp, rest, children);
  }

  function BadgeEl(props) {
    const Comp = C.Badge || "span";
    return h(Comp, {
      variant: props.variant,
      className: cn(
        Comp === "span" ? "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" : "",
        props.className
      ),
    }, props.children);
  }

  function MissingApi(method) {
    return h("p", { className: "text-sm text-destructive" }, "SDK.api." + method + " yok.");
  }

  function BotsPage() {
    const [profiles, setProfiles] = useState([]);
    const [activeName, setActiveName] = useState("");
    const [selectedName, setSelectedName] = useState("");
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState("");

    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [cloneFrom, setCloneFrom] = useState("");
    const [noSkills, setNoSkills] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState("");

    const [editingName, setEditingName] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editBusy, setEditBusy] = useState(false);

    const [jobs, setJobs] = useState([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState("");
    const [jobActionError, setJobActionError] = useState("");

    const [routineTitle, setRoutineTitle] = useState("");
    const [routinePrompt, setRoutinePrompt] = useState("");
    const [routineSchedule, setRoutineSchedule] = useState("");
    const [routineBusy, setRoutineBusy] = useState(false);
    const [routineError, setRoutineError] = useState("");

    const loadRoster = useCallback(function () {
      if (!SDK.api || typeof SDK.api.getProfiles !== "function") {
        setListError("SDK.api.getProfiles yok.");
        setListLoading(false);
        return Promise.resolve([]);
      }
      setListLoading(true);
      setListError("");
      const activeP = typeof SDK.api.getActiveProfile === "function"
        ? SDK.api.getActiveProfile().catch(function () { return null; })
        : Promise.resolve(null);
      return Promise.all([SDK.api.getProfiles(), activeP])
        .then(function (pair) {
          const data = pair[0] || {};
          const list = Array.isArray(data.profiles) ? data.profiles : [];
          const activeInfo = pair[1];
          const active = (activeInfo && (activeInfo.active || activeInfo.current)) || "";
          setProfiles(list);
          setActiveName(active);
          setSelectedName(function (prev) {
            if (prev && list.some(function (p) { return p.name === prev; })) return prev;
            if (active && list.some(function (p) { return p.name === active; })) return active;
            return list[0] ? list[0].name : "";
          });
          return list;
        })
        .catch(function (err) {
          setListError(parseApiError(err));
          return [];
        })
        .then(function (list) {
          setListLoading(false);
          return list;
        });
    }, []);

    const loadJobs = useCallback(function (profileName) {
      if (!profileName) {
        setJobs([]);
        setJobsError("");
        return;
      }
      if (!SDK.api || typeof SDK.api.getCronJobs !== "function") {
        setJobsError("SDK.api.getCronJobs yok.");
        setJobs([]);
        return;
      }
      setJobsLoading(true);
      setJobsError("");
      setJobActionError("");
      callApi("getCronJobs", [profileName])
        .then(function (data) {
          setJobs(normalizeJobs(data));
        })
        .catch(function (err) {
          setJobs([]);
          setJobsError(parseApiError(err));
        })
        .then(function () {
          setJobsLoading(false);
        });
    }, []);

    useEffect(function () {
      loadRoster();
    }, [loadRoster]);

    useEffect(function () {
      loadJobs(selectedName);
    }, [selectedName, loadJobs]);

    const selected = profiles.filter(function (p) { return p.name === selectedName; })[0] || null;

    function submitCreate(e) {
      if (e && e.preventDefault) e.preventDefault();
      setCreateError("");
      const name = String(newName || "").trim();
      if (!NAME_RE.test(name)) {
        setCreateError("Ad ^[a-z0-9][a-z0-9_-]{0,63}$ kalıbına uymalı.");
        return;
      }
      if (typeof SDK.api.createProfile !== "function") {
        setCreateError("SDK.api.createProfile yok.");
        return;
      }
      setCreateBusy(true);
      const body = { name: name, no_skills: !!noSkills };
      const desc = String(newDesc || "").trim();
      if (desc) body.description = desc;
      if (cloneFrom) body.clone_from = cloneFrom;
      callApi("createProfile", [body])
        .then(function () {
          return loadRoster();
        })
        .then(function () {
          openChat(name);
        })
        .catch(function (err) {
          setCreateError(parseApiError(err));
        })
        .then(function () {
          setCreateBusy(false);
        });
    }

    function saveDescription(name) {
      if (typeof SDK.api.updateProfileDescription !== "function") {
        setListError("SDK.api.updateProfileDescription yok.");
        return;
      }
      setEditBusy(true);
      callApi("updateProfileDescription", [name, editDesc])
        .then(function () {
          setEditingName("");
          return loadRoster();
        })
        .catch(function (err) {
          setListError(parseApiError(err));
        })
        .then(function () {
          setEditBusy(false);
        });
    }

    const profileDel = useConfirmDeleteSafe(function (name) {
      if (typeof SDK.api.deleteProfile !== "function") {
        setListError("SDK.api.deleteProfile yok.");
        return Promise.resolve();
      }
      const p = profiles.filter(function (x) { return x.name === name; })[0];
      if (isProtectedProfile(p) || name === "default") {
        setListError("Varsayılan profil silinemez.");
        return Promise.resolve();
      }
      return callApi("deleteProfile", [name])
        .then(function () {
          if (selectedName === name) setSelectedName("");
          return loadRoster();
        })
        .catch(function (err) {
          setListError(parseApiError(err));
        });
    });

    function runJobAction(method, id) {
      if (typeof SDK.api[method] !== "function") {
        setJobActionError("SDK.api." + method + " yok.");
        return;
      }
      setJobActionError("");
      callApi(method, [id, selectedName])
        .then(function () { loadJobs(selectedName); })
        .catch(function (err) { setJobActionError(parseApiError(err)); });
    }

    const jobDel = useConfirmDeleteSafe(function (id) {
      if (typeof SDK.api.deleteCronJob !== "function") {
        setJobActionError("SDK.api.deleteCronJob yok.");
        return Promise.resolve();
      }
      return callApi("deleteCronJob", [id, selectedName])
        .then(function () { loadJobs(selectedName); })
        .catch(function (err) { setJobActionError(parseApiError(err)); });
    });

    function submitRoutine(e) {
      if (e && e.preventDefault) e.preventDefault();
      setRoutineError("");
      if (!selectedName) {
        setRoutineError("Önce bir bot seçin.");
        return;
      }
      if (typeof SDK.api.createCronJob !== "function") {
        setRoutineError("SDK.api.createCronJob yok.");
        return;
      }
      const title = String(routineTitle || "").trim();
      const prompt = String(routinePrompt || "").trim();
      const schedule = String(routineSchedule || "").trim();
      if (!title || !prompt || !schedule) {
        setRoutineError("Ad, istem ve zamanlama gerekli.");
        return;
      }
      setRoutineBusy(true);
      callApi("createCronJob", [{
        name: "[bot:" + selectedName + "] " + title,
        prompt: prompt,
        schedule: schedule,
        deliver: "origin",
      }, selectedName])
        .then(function () {
          setRoutineTitle("");
          setRoutinePrompt("");
          setRoutineSchedule("");
          loadJobs(selectedName);
        })
        .catch(function (err) {
          setRoutineError(parseApiError(err));
        })
        .then(function () {
          setRoutineBusy(false);
        });
    }

    const Card = C.Card || "div";
    const CardHeader = C.CardHeader || "div";
    const CardTitle = C.CardTitle || "h2";
    const CardContent = C.CardContent || "div";
    const Separator = C.Separator || "hr";
    const ConfirmDialog = C.ConfirmDialog;
    const Dialog = C.Dialog;
    const DialogContent = C.DialogContent || "div";
    const DialogHeader = C.DialogHeader || "div";
    const DialogTitle = C.DialogTitle || "h3";
    const DialogDescription = C.DialogDescription || "p";
    const DialogFooter = C.DialogFooter || "div";
    const Checkbox = C.Checkbox;

    const createFields = h("div", { className: "grid gap-4 px-5 py-4" },
      h("div", { className: "grid gap-2" },
        h(FieldLabel, { htmlFor: "bot-name" }, "Ad"),
        h(TextInput, {
          id: "bot-name",
          value: newName,
          required: true,
          placeholder: "ornek-bot",
          onChange: function (e) { setNewName(e.target.value); },
        }),
        h("p", { className: "text-xs leading-relaxed text-muted-foreground" }, "Küçük harf, rakam, tire ve alt çizgi. En fazla 64 karakter.")
      ),
      h("div", { className: "grid gap-2" },
        h(FieldLabel, { htmlFor: "bot-desc" }, "Başlık / açıklama"),
        h(AreaInput, {
          id: "bot-desc",
          value: newDesc,
          placeholder: "İsteğe bağlı",
          onChange: function (e) { setNewDesc(e.target.value); },
        })
      ),
      h("button", {
        type: "button",
        className: "justify-self-start text-left text-sm text-muted-foreground underline-offset-4 hover:underline",
        onClick: function () { setShowAdvanced(!showAdvanced); },
      }, showAdvanced ? "Gelişmiş ayarları gizle" : "Gelişmiş"),
      showAdvanced ? h("div", { className: "grid gap-3 rounded-md border border-midground/15 p-4" },
        h("div", { className: "grid gap-2" },
          h(FieldLabel, { htmlFor: "bot-clone" }, "Şundan kopyala"),
          h("select", {
            id: "bot-clone",
            className: "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
            value: cloneFrom,
            onChange: function (e) { setCloneFrom(e.target.value); },
          },
            h("option", { value: "" }, "— yok —"),
            profiles.map(function (p) {
              return h("option", { key: p.name, value: p.name }, p.name);
            })
          )
        ),
        h("label", { className: "flex items-start gap-2 text-sm leading-relaxed" },
          Checkbox
            ? h(Checkbox, {
              checked: noSkills,
              onCheckedChange: function (v) { setNoSkills(!!v); },
            })
            : h("input", {
              type: "checkbox",
              className: "mt-0.5",
              checked: noSkills,
              onChange: function (e) { setNoSkills(e.target.checked); },
            }),
          "Becerisiz oluştur (no_skills)"
        )
      ) : null,
      createError ? h("p", { className: "text-sm leading-relaxed text-destructive" }, createError) : null
    );

    const createActions = h(DialogFooter, {
      className: DialogFooter === "div"
        ? "flex flex-wrap items-center justify-end gap-2 border-t border-midground/15 px-5 py-3"
        : "border-t border-midground/15 px-5",
    },
      h(Btn, {
        type: "button",
        outlined: true,
        onClick: function () { setShowCreate(false); setCreateError(""); },
      }, "Vazgeç"),
      h(Btn, { type: "submit", disabled: createBusy }, createBusy ? "Oluşturuluyor…" : "Oluştur")
    );

    const createForm = h("form", { className: "min-w-0", onSubmit: submitCreate },
      createFields,
      createActions
    );

    const createUi = Dialog
      ? h(React.Fragment, null,
        h(Btn, { onClick: function () { setShowCreate(true); } }, "Yeni ajan"),
        h(Dialog, {
          open: showCreate,
          onOpenChange: setShowCreate,
        },
          h(DialogContent, { className: "w-[calc(100%-2rem)] max-w-lg" },
            h(DialogHeader, { className: "pr-10" },
              h(DialogTitle, null, "Yeni ajan"),
              h(DialogDescription, null, "Yeni bir Hermes profili oluşturur. Sohbet ve rutinler bu bota bağlanır.")
            ),
            createForm
          )
        )
      )
      : h("div", { className: "grid gap-3" },
        h(Btn, { onClick: function () { setShowCreate(!showCreate); } }, "Yeni ajan"),
        showCreate ? h(Card, { className: "border-dashed" }, h(CardContent, { className: "p-5" }, createForm)) : null
      );

    function renderRow(p) {
      const isActive = p.name === activeName;
      const isSelected = p.name === selectedName;
      const subtitle = (p.description && String(p.description).trim())
        || [p.model, p.provider].filter(Boolean).join(" · ")
        || "Profil";
      return h("div", {
        key: p.name,
        className: cn(
          "group rounded-lg border p-3 transition-colors",
          isSelected ? "border-primary bg-muted/40" : "hover:bg-muted/30"
        ),
      },
        h("div", {
          className: "flex cursor-pointer items-start gap-3",
          onClick: function () { setSelectedName(p.name); },
        },
          h("div", {
            className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium",
            "aria-hidden": "true",
          }, initials(p.name)),
          h("div", { className: "min-w-0 flex-1" },
            h("div", { className: "flex flex-wrap items-center gap-2" },
              h("span", { className: "truncate font-medium" }, p.name),
              isActive ? h(BadgeEl, { variant: "secondary" }, "Aktif") : null
            ),
            h("p", { className: "truncate text-sm text-muted-foreground" }, subtitle)
          )
        ),
        editingName === p.name
          ? h("div", { className: "mt-3 grid gap-2" },
            h(AreaInput, {
              value: editDesc,
              onChange: function (e) { setEditDesc(e.target.value); },
            }),
            h("div", { className: "flex gap-2" },
              h(Btn, {
                size: "sm",
                disabled: editBusy,
                onClick: function () { saveDescription(p.name); },
              }, "Kaydet"),
              h(Btn, {
                size: "sm",
                variant: "outline",
                onClick: function () { setEditingName(""); },
              }, "Vazgeç")
            )
          )
          : h("div", { className: "mt-3 flex flex-wrap gap-2" },
            h(Btn, {
              size: "sm",
              onClick: function (e) {
                if (e && e.stopPropagation) e.stopPropagation();
                openChat(p.name);
              },
            }, "Sohbet aç"),
            h(Btn, {
              size: "sm",
              variant: "outline",
              onClick: function (e) {
                if (e && e.stopPropagation) e.stopPropagation();
                setEditingName(p.name);
                setEditDesc(p.description || "");
              },
            }, "Düzenle"),
            isProtectedProfile(p)
              ? null
              : h(Btn, {
                size: "sm",
                variant: "destructive",
                onClick: function (e) {
                  if (e && e.stopPropagation) e.stopPropagation();
                  profileDel.requestDelete(p.name);
                },
              }, "Sil")
          )
      );
    }

    const rosterBody = listLoading
      ? h("p", { className: "text-sm text-muted-foreground" }, "Yükleniyor…")
      : listError
        ? h("p", { className: "text-sm text-destructive" }, listError)
        : profiles.length === 0
          ? h("p", { className: "text-sm text-muted-foreground" }, "Henüz bot yok — bir tane oluşturun.")
          : h("div", { className: "grid gap-2" }, profiles.map(renderRow));

    const pendingJob = jobs.filter(function (j) { return j.id === jobDel.pendingId; })[0];

    return h("div", { className: "mx-auto flex w-full max-w-6xl flex-col gap-4 p-4" },
      h("div", null,
        h("h1", { className: "text-2xl font-semibold tracking-tight" }, "Botlar"),
        h("p", { className: "text-sm text-muted-foreground" },
          "Her Hermes profili bir bottur. Sohbet açın, açıklama düzenleyin, rutinler zamanlayın.")
      ),
      h("div", { className: "grid gap-4 md:grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)]" },
        h(Card, null,
          h(CardHeader, { className: "flex flex-row items-center justify-between space-y-0" },
            h(CardTitle, null, "Botlar"),
            createUi
          ),
          h(CardContent, { className: "grid gap-3" }, rosterBody)
        ),
        h(Card, null,
          h(CardHeader, null,
            h(CardTitle, null, "Rutinler"),
            h("p", { className: "text-sm text-muted-foreground" },
              selectedName ? ("Seçili bot: " + selectedName) : "Bir bot seçin")
          ),
          h(CardContent, { className: "grid gap-4" },
            !selectedName
              ? h("p", { className: "text-sm text-muted-foreground" }, "Rutinleri görmek için soldan bir bot seçin.")
              : h(React.Fragment, null,
                jobsLoading
                  ? h("p", { className: "text-sm text-muted-foreground" }, "Rutinler yükleniyor…")
                  : jobsError
                    ? h("p", { className: "text-sm text-destructive" }, jobsError)
                    : jobs.length === 0
                      ? h("p", { className: "text-sm text-muted-foreground" }, "Bu bot için rutin yok.")
                      : h("div", { className: "grid gap-2" }, jobs.map(function (job) {
                        const id = job.id;
                        return h("div", { key: id, className: "rounded-lg border p-3" },
                          h("div", { className: "flex flex-wrap items-center justify-between gap-2" },
                            h("div", { className: "min-w-0" },
                              h("div", { className: "font-medium" }, job.name || id),
                              h("p", { className: "text-sm text-muted-foreground" }, jobSchedule(job) || "Zamanlama yok")
                            ),
                            h("div", { className: "flex flex-wrap gap-1" },
                              job.enabled
                                ? h(BadgeEl, { variant: "secondary" }, "Açık")
                                : h(BadgeEl, { variant: "outline" }, "Duraklatıldı"),
                              job.last_status
                                ? h(BadgeEl, { variant: "outline" }, String(job.last_status))
                                : null
                            )
                          ),
                          job.next_run_at
                            ? h("p", { className: "mt-1 text-xs text-muted-foreground" },
                              "Sonraki: " + (isoTimeAgo(job.next_run_at) || job.next_run_at))
                            : null,
                          h("div", { className: "mt-2 flex flex-wrap gap-2" },
                            job.enabled
                              ? h(Btn, { size: "sm", variant: "outline", onClick: function () { runJobAction("pauseCronJob", id); } }, "Duraklat")
                              : h(Btn, { size: "sm", variant: "outline", onClick: function () { runJobAction("resumeCronJob", id); } }, "Sürdür"),
                            h(Btn, { size: "sm", variant: "outline", onClick: function () { runJobAction("triggerCronJob", id); } }, "Çalıştır"),
                            h(Btn, {
                              size: "sm",
                              variant: "destructive",
                              onClick: function () { jobDel.requestDelete(id); },
                            }, "Sil")
                          )
                        );
                      })),
                jobActionError ? h("p", { className: "text-sm text-destructive" }, jobActionError) : null,
                h(Separator, { className: "my-1" }),
                h("form", { className: "grid gap-3", onSubmit: submitRoutine },
                  h("p", { className: "text-sm font-medium" }, "Yeni rutin"),
                  h("div", { className: "grid gap-1.5" },
                    h(FieldLabel, { htmlFor: "rt-name" }, "Ad"),
                    h(TextInput, {
                      id: "rt-name",
                      value: routineTitle,
                      placeholder: "sabah-ozet",
                      onChange: function (e) { setRoutineTitle(e.target.value); },
                    })
                  ),
                  h("div", { className: "grid gap-1.5" },
                    h(FieldLabel, { htmlFor: "rt-prompt" }, "İstem"),
                    h(AreaInput, {
                      id: "rt-prompt",
                      value: routinePrompt,
                      placeholder: "Bu bota ne yapsın?",
                      onChange: function (e) { setRoutinePrompt(e.target.value); },
                    })
                  ),
                  h("div", { className: "grid gap-1.5" },
                    h(FieldLabel, { htmlFor: "rt-sched" }, "Zamanlama"),
                    h(TextInput, {
                      id: "rt-sched",
                      value: routineSchedule,
                      placeholder: "0 9 * * * veya every 1h",
                      onChange: function (e) { setRoutineSchedule(e.target.value); },
                    })
                  ),
                  routineError ? h("p", { className: "text-sm text-destructive" }, routineError) : null,
                  h(Btn, { type: "submit", disabled: routineBusy || !selectedName },
                    routineBusy ? "Oluşturuluyor…" : "Oluştur")
                )
              )
          )
        )
      ),
      ConfirmDialog && profileDel.isOpen
        ? h(ConfirmDialog, {
          open: profileDel.isOpen,
          loading: profileDel.isDeleting,
          onCancel: profileDel.cancel,
          onConfirm: profileDel.confirm,
          title: "Botu sil",
          description: (profileDel.pendingId || "") + " kalıcı olarak silinecek. Bu işlem geri alınamaz.",
          confirmLabel: "Sil",
          cancelLabel: "Vazgeç",
        })
        : null,
      ConfirmDialog && jobDel.isOpen
        ? h(ConfirmDialog, {
          open: jobDel.isOpen,
          loading: jobDel.isDeleting,
          onCancel: jobDel.cancel,
          onConfirm: jobDel.confirm,
          title: "Rutini sil",
          description: ((pendingJob && pendingJob.name) || jobDel.pendingId || "Bu rutin") + " silinecek.",
          confirmLabel: "Sil",
          cancelLabel: "Vazgeç",
        })
        : null
    );
  }

  window.__HERMES_PLUGINS__.register("hermes-bots", BotsPage);
})();
