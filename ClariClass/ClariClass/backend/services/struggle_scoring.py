from typing import List, Dict, Any

def compute_chunk_struggle(
    signals: List[Dict[str, Any]], 
    total_students: int,
    threshold_percent: float = 25.0,
    threshold_count: int = 10,
    min_observations: int = 3
) -> Dict[str, Any]:
    """
    Computes evidence-based multimodal difficulty score for a content block.
    
    Inputs:
    - signals: list of dicts with keys: 'student_id', 'signal_type', 'value'
    - total_students: denominator (active students connected)
    - threshold_percent: percentage trigger (e.g. 25%)
    - threshold_count: absolute count trigger (e.g. 10 students)
    - min_observations: minimum observed students required before flagging
    """
    # Group observations by student to avoid duplicate signal inflation
    student_evidence = {}
    important_votes = set()
    valid_observed_students = set()

    for s in signals:
        sid = s["student_id"]
        stype = s["signal_type"]
        val = float(s.get("value", 1.0))
        valid_observed_students.add(sid)

        if sid not in student_evidence:
            student_evidence[sid] = {
                "flag_difficult": False,
                "dwell_struggle": False,
                "reread_struggle": False,
                "quiz_failed": False,
                "score": 0.0
            }

        if stype == "flag_difficult":
            student_evidence[sid]["flag_difficult"] = True
            student_evidence[sid]["score"] += 1.0
        elif stype in ["dwell_ms", "gaze_dwell"] and val >= 45000: # 45 seconds on single paragraph
            student_evidence[sid]["dwell_struggle"] = True
            student_evidence[sid]["score"] += 0.8
        elif stype == "reread" and val >= 2: # 2+ return rereadings
            student_evidence[sid]["reread_struggle"] = True
            student_evidence[sid]["score"] += 0.7
        elif stype == "quiz_response" and val == 0.0: # Failed comprehension check
            student_evidence[sid]["quiz_failed"] = True
            student_evidence[sid]["score"] += 1.0
        elif stype == "flag_important":
            important_votes.add(sid)

    # Count distinct struggling students (score >= 0.8)
    struggling_student_ids = [
        sid for sid, ev in student_evidence.items() 
        if ev["score"] >= 0.8 or ev["flag_difficult"] or ev["quiz_failed"]
    ]
    struggling_count = len(struggling_student_ids)
    valid_observations_count = len(valid_observed_students)

    # Denominator calculation
    effective_total = max(total_students, valid_observations_count)
    if effective_total > 0:
        struggle_percentage = round((struggling_count / effective_total) * 100.0, 1)
    else:
        struggle_percentage = 0.0

    # Precise Threshold Evaluation:
    # Trigger ONLY when affected_count strictly exceeds threshold_count (e.g. >10)
    # OR struggle_percentage strictly exceeds threshold_percent with sufficient observations
    count_exceeded = struggling_count > threshold_count
    percent_exceeded = (struggle_percentage > threshold_percent) and (valid_observations_count >= min_observations)
    
    threshold_exceeded = bool(count_exceeded or percent_exceeded)

    status = "monitoring"
    if valid_observations_count < min_observations and struggling_count == 0:
        status = "insufficient_data"
    elif threshold_exceeded:
        status = "difficulty_detected"

    return {
        "struggling_students_count": struggling_count,
        "valid_observations_count": valid_observations_count,
        "total_students": effective_total,
        "struggle_percentage": struggle_percentage,
        "important_students_count": len(important_votes),
        "threshold_count": threshold_count,
        "threshold_percent": threshold_percent,
        "threshold_exceeded": threshold_exceeded,
        "status": status,
        "struggling_student_ids": struggling_student_ids
    }
