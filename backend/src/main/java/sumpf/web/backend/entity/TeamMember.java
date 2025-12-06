package sumpf.web.backend.entity;

import jakarta.persistence.*;

@Entity
public class TeamMember {

    @GeneratedValue
    @Id
    private Integer id;

    @ManyToOne
    @JoinColumn(name="team_id", nullable = false)
    private Team team;

    @ManyToOne
    @JoinColumn(name="member_id", nullable = false)
    private Member member;
}
