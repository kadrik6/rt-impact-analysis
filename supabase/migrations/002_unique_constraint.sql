alter table legal_chunks
  add constraint unique_act_paragraph unique (act_id, paragraph_nr);
