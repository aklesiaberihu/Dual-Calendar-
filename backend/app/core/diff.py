def diff_dicts(old: dict, new: dict):
    changes = []
    for k in sorted(set(old.keys()) | set(new.keys())):
        if old.get(k) != new.get(k):
            changes.append({"field": k, "from": old.get(k), "to": new.get(k)})

    if not changes:
        digest = "No changes"
    else:
        fields = ", ".join(c["field"] for c in changes)
        digest = f"Changes: {fields}"

    return {"changes": changes, "digest": digest}
