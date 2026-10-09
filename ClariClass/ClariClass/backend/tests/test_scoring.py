from services.struggle_scoring import compute_chunk_struggle

def test_struggle_scoring_exact_threshold_bounds():
    # Configure class of 40 students with threshold of 10 students
    total_students = 40
    threshold_count = 10

    # 1. 10 affected students -> Threshold NOT exceeded
    signals_10 = [{"student_id": i, "signal_type": "flag_difficult", "value": 1.0} for i in range(1, 11)]
    res_10 = compute_chunk_struggle(signals_10, total_students, threshold_count=threshold_count, threshold_percent=30.0)
    assert res_10["struggling_students_count"] == 10
    assert res_10["threshold_exceeded"] is False

    # 2. 11 affected students -> Threshold EXCEEDED
    signals_11 = [{"student_id": i, "signal_type": "flag_difficult", "value": 1.0} for i in range(1, 12)]
    res_11 = compute_chunk_struggle(signals_11, total_students, threshold_count=threshold_count, threshold_percent=30.0)
    assert res_11["struggling_students_count"] == 11
    assert res_11["threshold_exceeded"] is True

def test_deduplication_prevents_signal_inflation():
    # 1 student sending 5 difficult flags should count as only 1 struggling student
    signals = [{"student_id": 1, "signal_type": "flag_difficult", "value": 1.0} for _ in range(5)]
    res = compute_chunk_struggle(signals, total_students=20, threshold_count=10)
    assert res["struggling_students_count"] == 1
    assert res["threshold_exceeded"] is False
