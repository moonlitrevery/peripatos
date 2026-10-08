
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "achievements": {
                  Row: {
                    "color": string,"description": string,"emoji": string,"emoji_label": string,"is_manual": boolean,"is_secret": boolean,"name": string,"position": number,"private_by_default": boolean,"slug": string
                  }
                  Insert: {
                    "color": string,"description": string,"emoji": string,"emoji_label": string,"is_manual"?: boolean,"is_secret"?: boolean,"name": string,"position": number,"private_by_default"?: boolean,"slug": string
                  }
                  Update: {
                    "color"?: string,"description"?: string,"emoji"?: string,"emoji_label"?: string,"is_manual"?: boolean,"is_secret"?: boolean,"name"?: string,"position"?: number,"private_by_default"?: boolean,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id"?: string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_reads": {
                  Row: {
                    "conversation_id": string,"last_read_at": string,"user_id": string
                  }
                  Insert: {
                    "conversation_id": string,"last_read_at"?: string,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"last_read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_reads_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"id": string,"institution_id": string,"last_message_at": string | null,"user_a": string | null,"user_b": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"institution_id": string,"last_message_at"?: string | null,"user_a"?: string | null,"user_b"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"institution_id"?: string,"last_message_at"?: string | null,"user_a"?: string | null,"user_b"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_user_a_institution_id_fkey"
      columns: ["user_a","institution_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","institution_id"]
    },{
      foreignKeyName: "conversations_user_b_institution_id_fkey"
      columns: ["user_b","institution_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","institution_id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string
                  }
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"institutions": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"gif_alt": string | null,"gif_id": string | null,"id": string,"notified_at": string | null,"sender_id": string
                  }
                  Insert: {
                    "body"?: string,"conversation_id": string,"created_at"?: string,"gif_alt"?: string | null,"gif_id"?: string | null,"id"?: string,"notified_at"?: string | null,"sender_id"?: string
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"gif_alt"?: string | null,"gif_id"?: string | null,"id"?: string,"notified_at"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_actions": {
                  Row: {
                    "action": Database["public"]['Enums']["moderation_action_type"],"actor_id": string | null,"created_at": string,"id": number,"institution_id": string,"metadata": NonNullable<Json>,"reason": string,"report_id": string | null,"target_post_id": string | null,"target_user_id": string | null
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["moderation_action_type"],"actor_id"?: string | null,"created_at"?: string,"id"?: never,"institution_id": string,"metadata"?: NonNullable<Json>,"reason": string,"report_id"?: string | null,"target_post_id"?: string | null,"target_user_id"?: string | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["moderation_action_type"],"actor_id"?: string | null,"created_at"?: string,"id"?: never,"institution_id"?: string,"metadata"?: NonNullable<Json>,"reason"?: string,"report_id"?: string | null,"target_post_id"?: string | null,"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_actions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "institutions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_target_post_id_fkey"
      columns: ["target_post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "moderation_actions_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "achievement_slug": string | null,"actor_id": string | null,"created_at": string,"id": string,"pushed_at": string | null,"read_at": string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Insert: {
                    "achievement_slug"?: string | null,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"pushed_at"?: string | null,"read_at"?: string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "achievement_slug"?: string | null,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"pushed_at"?: string | null,"read_at"?: string | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_achievement_slug_fkey"
      columns: ["achievement_slug"]
isOneToOne: false
      referencedRelation: "achievements"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"gif_alt": string | null,"gif_id": string | null,"hidden_at": string | null,"hidden_by": string | null,"id": string,"institution_id": string
                  }
                  Insert: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"gif_alt"?: string | null,"gif_id"?: string | null,"hidden_at"?: string | null,"hidden_by"?: string | null,"id"?: string,"institution_id"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"gif_alt"?: string | null,"gif_id"?: string | null,"hidden_at"?: string | null,"hidden_by"?: string | null,"id"?: string,"institution_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_id_institution_id_fkey"
      columns: ["author_id","institution_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","institution_id"]
    },{
      foreignKeyName: "posts_hidden_by_fkey"
      columns: ["hidden_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_sensitive_tags": {
                  Row: {
                    "created_at": string,"tag_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"tag_id": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"tag_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_sensitive_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_sensitive_tags_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_tags": {
                  Row: {
                    "created_at": string,"tag_id": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"tag_id": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"tag_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_tags_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"avatar_preset": number | null,"avatar_status": Database["public"]['Enums']["avatar_status"],"banned_at": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"institution_id": string,"onboarding_completo": boolean,"updated_at": string,"username": string | null
                  }
                  Insert: {
                    "avatar_path"?: string | null,"avatar_preset"?: number | null,"avatar_status"?: Database["public"]['Enums']["avatar_status"],"banned_at"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"institution_id": string,"onboarding_completo"?: boolean,"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_path"?: string | null,"avatar_preset"?: number | null,"avatar_status"?: Database["public"]['Enums']["avatar_status"],"banned_at"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"institution_id"?: string,"onboarding_completo"?: boolean,"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "institutions"
      referencedColumns: ["id"]
    }
                  ]
                },"push_preferences": {
                  Row: {
                    "avatar": boolean,"conquista": boolean,"denuncia": boolean,"mensagem": boolean,"mutuo": boolean,"novo_seguidor": boolean,"termos": boolean,"user_id": string
                  }
                  Insert: {
                    "avatar"?: boolean,"conquista"?: boolean,"denuncia"?: boolean,"mensagem"?: boolean,"mutuo"?: boolean,"novo_seguidor"?: boolean,"termos"?: boolean,"user_id"?: string
                  }
                  Update: {
                    "avatar"?: boolean,"conquista"?: boolean,"denuncia"?: boolean,"mensagem"?: boolean,"mutuo"?: boolean,"novo_seguidor"?: boolean,"termos"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"institution_id": string,"message_body": string | null,"message_gif_alt": string | null,"message_gif_id": string | null,"message_id": string | null,"message_sender_id": string | null,"message_sent_at": string | null,"post_id": string | null,"profile_id": string | null,"reason": Database["public"]['Enums']["report_reason"],"reporter_id": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["report_status"]
                  }
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"institution_id"?: string,"message_body"?: string | null,"message_gif_alt"?: string | null,"message_gif_id"?: string | null,"message_id"?: string | null,"message_sender_id"?: string | null,"message_sent_at"?: string | null,"post_id"?: string | null,"profile_id"?: string | null,"reason": Database["public"]['Enums']["report_reason"],"reporter_id"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"institution_id"?: string,"message_body"?: string | null,"message_gif_alt"?: string | null,"message_gif_id"?: string | null,"message_id"?: string | null,"message_sender_id"?: string | null,"message_sent_at"?: string | null,"post_id"?: string | null,"profile_id"?: string | null,"reason"?: Database["public"]['Enums']["report_reason"],"reporter_id"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_message_sender_id_fkey"
      columns: ["message_sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_institution_id_fkey"
      columns: ["reporter_id","institution_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","institution_id"]
    },{
      foreignKeyName: "reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_roles": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"institution_id": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"institution_id": string,"role": Database["public"]['Enums']["staff_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"institution_id"?: string,"role"?: Database["public"]['Enums']["staff_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_roles_user_id_institution_id_fkey"
      columns: ["user_id","institution_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id","institution_id"]
    }
                  ]
                },"tag_requests": {
                  Row: {
                    "category": string | null,"created_at": string,"id": string,"institution_id": string,"justification": string | null,"name": string,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["tag_request_status"],"user_id": string
                  }
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"institution_id"?: string,"justification"?: string | null,"name": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["tag_request_status"],"user_id"?: string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"institution_id"?: string,"justification"?: string | null,"name"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["tag_request_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tag_requests_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tag_requests_user_id_institution_id_fkey"
      columns: ["user_id","institution_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","institution_id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "category": string,"created_at": string,"id": number,"is_sensitive": boolean,"name": string,"slug": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"id"?: never,"is_sensitive"?: boolean,"name": string,"slug": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: never,"is_sensitive"?: boolean,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_achievements": {
                  Row: {
                    "achievement_slug": string,"hidden": boolean,"user_id": string
                  }
                  Insert: {
                    "achievement_slug": string,"hidden"?: boolean,"user_id": string
                  }
                  Update: {
                    "achievement_slug"?: string,"hidden"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_achievements_achievement_slug_fkey"
      columns: ["achievement_slug"]
isOneToOne: false
      referencedRelation: "achievements"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "user_achievements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abrir_conversa":
{ Args: { "p_outro": string }; Returns: string
                           },
"aceitar_termos":
{ Args: { "p_versao": string }; Returns: string
                           },
"afinidade":
{ Args: { "p_outro": string }; Returns: number
                           },
"apagar_post":
{ Args: { "p_post_id": string }; Returns: undefined
                           },
"banir_usuario":
{ Args: { "p_motivo": string,"p_user_id": string }; Returns: undefined
                           },
"completar_onboarding":
{ Args: { "p_bio"?: string,"p_data_nascimento": string,"p_display_name": string,"p_termos_versao"?: string,"p_username": string }; Returns: Json
                           },
"conceder_conquista":
{ Args: { "p_conquista": string,"p_motivo": string,"p_user_id": string }; Returns: undefined
                           },
"consentir_tags_sensiveis":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"conta_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"definir_cargo":
{ Args: { "p_motivo": string,"p_papel": Database["public"]['Enums']["staff_role"],"p_user_id": string }; Returns: undefined
                           },
"denunciar_mensagem":
{ Args: { "p_detalhe"?: string,"p_mensagem": string,"p_motivo": Database["public"]['Enums']["report_reason"] }; Returns: string
                           },
"desbanir_usuario":
{ Args: { "p_motivo": string,"p_user_id": string }; Returns: undefined
                           },
"excluir_conta":
{ Args: { "p_confirmacao": string }; Returns: undefined
                           },
"feed":
{ Args: { "p_cursor"?: string,"p_limite"?: number }; Returns: {
              "afinidade": number,"author_id": string,"avatar_path": string,"avatar_preset": number,"body": string,"created_at": string,"display_name": string,"edited_at": string,"gif_alt": string,"gif_id": string,"next_cursor": string,"origem": string,"post_id": string,"score": number,"username": string
            }[]
                           },
"marcar_conversa_lida":
{ Args: { "p_conversa": string }; Returns: undefined
                           },
"marcar_notificacoes_lidas":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"meus_bloqueios":
{ Args: Record<PropertyKey, never>; Returns: {
              "bloqueado_em": string,"display_name": string,"user_id": string,"username": string
            }[]
                           },
"minhas_conquistas":
{ Args: Record<PropertyKey, never>; Returns: {
              "ganha_em": string,"oculta": boolean,"slug": string
            }[]
                           },
"minhas_conversas":
{ Args: Record<PropertyKey, never>; Returns: {
              "aberta": boolean,"avatar_path": string,"avatar_preset": number,"conversa_id": string,"display_name": string,"nao_lidas": number,"outro_excluido": boolean,"outro_id": string,"previa": string,"previa_minha": boolean,"ultima_em": string,"username": string
            }[]
                           },
"minhas_denuncias":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"id": string,"post_id": string,"profile_id": string,"reason": Database["public"]['Enums']["report_reason"],"status": Database["public"]['Enums']["report_status"]
            }[]
                           },
"minhas_notificacoes":
{ Args: Record<PropertyKey, never>; Returns: {
              "conquista_cor": string,"conquista_emoji": string,"conquista_emoji_rotulo": string,"conquista_nome": string,"conquista_slug": string,"grupo": string,"lida": boolean,"pessoas": Json,"quantidade": number,"tipo": Database["public"]['Enums']["notification_type"],"ultima_em": string
            }[]
                           },
"moderar_avatar":
{ Args: { "p_aprovar": boolean,"p_motivo": string,"p_user_id": string }; Returns: undefined
                           },
"ocultar_post":
{ Args: { "p_motivo": string,"p_post_id": string }; Returns: undefined
                           },
"pessoas_parecidas":
{ Args: { "p_limite"?: number }; Returns: {
              "afinidade": number,"avatar_path": string,"avatar_preset": number,"bio": string,"display_name": string,"mutual": boolean,"tags_em_comum": Json,"user_id": string,"username": string
            }[]
                           },
"preparar_notificacao":
{ Args: { "p_mensagem": string }; Returns: {
              "conversa": string,"destinatario": string,"remetente": string
            }[]
                           },
"preparar_push_de_notificacao":
{ Args: { "p_notificacao": string }; Returns: {
              "destinatario": string,"tipo": string
            }[]
                           },
"registrar_busca_gif":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"remover_cargo":
{ Args: { "p_motivo": string,"p_user_id": string }; Returns: undefined
                           },
"resolver_denuncia":
{ Args: { "p_nota": string,"p_report_id": string,"p_status": Database["public"]['Enums']["report_status"] }; Returns: undefined
                           },
"resolver_pedido_tag":
{ Args: { "p_aprovar": boolean,"p_motivo": string,"p_request_id": string }; Returns: undefined
                           },
"responder_enigma":
{ Args: { "p_resposta": string }; Returns: boolean
                           },
"restaurar_post":
{ Args: { "p_motivo": string,"p_post_id": string }; Returns: undefined
                           },
"revogar_tags_sensiveis":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"total_nao_lidas":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"total_notificacoes_nao_lidas":
{ Args: Record<PropertyKey, never>; Returns: number
                           }
          }
          Enums: {
            "avatar_status": "sem_avatar"|"pendente"|"aprovado"|"recusado","moderation_action_type": "ocultar_post"|"restaurar_post"|"banir_usuario"|"desbanir_usuario"|"aprovar_avatar"|"recusar_avatar"|"resolver_denuncia"|"conceder_cargo"|"remover_cargo"|"resolver_pedido_tag"|"conceder_conquista","notification_type": "novo_seguidor"|"mutuo"|"avatar_aprovado"|"avatar_recusado"|"denuncia_analisada"|"termos_atualizados"|"conquista","report_reason": "spam"|"assedio"|"discurso_de_odio"|"conteudo_sexual"|"violencia_ou_ameaca"|"perfil_falso"|"menor_de_idade"|"exposicao_de_dados_pessoais"|"outro","report_status": "aberta"|"em_analise"|"resolvida"|"rejeitada","staff_role": "moderador"|"admin","tag_request_status": "pendente"|"aprovada"|"recusada"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "avatar_status": ["sem_avatar", "pendente", "aprovado", "recusado"],"moderation_action_type": ["ocultar_post", "restaurar_post", "banir_usuario", "desbanir_usuario", "aprovar_avatar", "recusar_avatar", "resolver_denuncia", "conceder_cargo", "remover_cargo", "resolver_pedido_tag", "conceder_conquista"],"notification_type": ["novo_seguidor", "mutuo", "avatar_aprovado", "avatar_recusado", "denuncia_analisada", "termos_atualizados", "conquista"],"report_reason": ["spam", "assedio", "discurso_de_odio", "conteudo_sexual", "violencia_ou_ameaca", "perfil_falso", "menor_de_idade", "exposicao_de_dados_pessoais", "outro"],"report_status": ["aberta", "em_analise", "resolvida", "rejeitada"],"staff_role": ["moderador", "admin"],"tag_request_status": ["pendente", "aprovada", "recusada"]
          }
        }
} as const
